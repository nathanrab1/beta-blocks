# boot.py instalado pelo Beta Blocks.
# Ao ligar: entra no ultimo Wi-Fi usado (wifi.json) e fica esperando programas
# novos na porta 8266, numa thread separada. Nao interfere no main.py.
import json
import time
import socket
import machine
import _thread

_OTA_PORT = 8266
_CORS = b'Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Private-Network: true\r\n'


def _urldecode(b):
    out = bytearray()
    i = 0
    while i < len(b):
        if b[i] == 0x25 and i + 2 < len(b):  # %XX
            out.append(int(b[i + 1:i + 3], 16))
            i += 3
        elif b[i] == 0x2B:  # +
            out.append(0x20)
            i += 1
        else:
            out.append(b[i])
            i += 1
    return bytes(out).decode()


def _ota_limpar():
    """Antes de reiniciar com um programa novo: apaga o visor, o LED e as portas.
    O visor e o LED guardam o ultimo estado mesmo depois do reset."""
    g = globals()
    try:
        o = g.get('oled')
        if o is not None:
            g['oled'] = None  # o programa antigo para de desenhar
            time.sleep_ms(150)
            o.fill(0)
            o.show()
    except Exception:
        pass
    try:
        for t in ('_bb_timer', '_vis_timer', '_key_timer', '_wifi_timer'):
            if t in g:
                g[t].deinit()
    except Exception:
        pass
    try:
        for p in g.get('_pwms', {}).values():
            p.deinit()
    except Exception:
        pass
    try:
        from neopixel import NeoPixel
        np = NeoPixel(machine.Pin(21, machine.Pin.OUT), 1)
        np[0] = (0, 0, 0)
        np.write()
    except Exception:
        pass


def _ota_atender(cl):
    cl.settimeout(5)
    req = b''
    while b'\r\n\r\n' not in req:
        parte = cl.recv(1024)
        if not parte:
            return
        req += parte
    cab, _, corpo = req.partition(b'\r\n\r\n')
    linha = cab.split(b'\r\n', 1)[0]
    if linha.startswith(b'OPTIONS'):
        cl.write(b'HTTP/1.0 204 No Content\r\n' + _CORS +
                 b'Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n'
                 b'Access-Control-Allow-Headers: content-type\r\nConnection: close\r\n\r\n')
    elif linha.startswith(b'GET /k?n=') or linha.startswith(b'GET /b?n='):
        # tecla do computador (/k) ou comando de Wi-Fi (/b) vindos do app, sem cabo.
        # As funcoes _teclas / _wifi_disparar sao definidas pelo main.py no mesmo namespace.
        nome = _urldecode(linha[9:].split(b' ')[0])
        cl.write(b'HTTP/1.0 204 No Content\r\n' + _CORS + b'Connection: close\r\n\r\n')
        cl.close()
        g = globals()
        try:
            if linha.startswith(b'GET /k?n='):
                f = g.get('_teclas', {}).get(nome)
                if f:
                    f()
            elif '_wifi_disparar' in g:
                g['_wifi_disparar'](nome)
        except Exception as e:
            print('evento pelo Wi-Fi: erro', e)
    elif linha.startswith(b'GET /ping'):
        cl.write(b'HTTP/1.0 200 OK\r\n' + _CORS +
                 b'Content-Type: text/plain\r\nConnection: close\r\n\r\nbetablocks')
    elif linha.startswith(b'POST /programa'):
        tam = 0
        for l in cab.split(b'\r\n'):
            if l.lower().startswith(b'content-length:'):
                tam = int(l.split(b':')[1])
        while len(corpo) < tam:
            parte = cl.recv(1024)
            if not parte:
                break
            corpo += parte
        arquivos = json.loads(corpo)
        for nome, conteudo in arquivos.items():
            with open(nome, 'w') as f:
                f.write(conteudo)
        cl.write(b'HTTP/1.0 200 OK\r\n' + _CORS + b'Connection: close\r\n\r\nok')
        cl.close()
        time.sleep_ms(200)
        _ota_limpar()
        machine.reset()
    else:
        cl.write(b'HTTP/1.0 404 Not Found\r\nConnection: close\r\n\r\n')


def _ota_servidor():
    import network
    wlan = network.WLAN(network.STA_IF)
    # Fica esperando ate a placa estar no Wi-Fi: pelo wifi.json (gravado na
    # primeira conexao) ou porque o programa (main.py) conectou por conta propria.
    while True:
        try:
            if wlan.isconnected():
                break
            with open('wifi.json') as f:
                cfg = json.load(f)
            wlan.active(True)
            try:
                wlan.config(pm=network.WLAN.PM_NONE)  # sem economia de energia: responde sempre
            except Exception:
                pass
            if wlan.status() != network.STAT_CONNECTING:
                wlan.connect(cfg['ssid'], cfg['senha'])
            for _ in range(150):
                if wlan.isconnected():
                    break
                time.sleep_ms(100)
        except OSError:
            pass  # sem wifi.json ainda: tenta de novo daqui a pouco
        except Exception as e:
            print('OTA:', e)
        if wlan.isconnected():
            break
        time.sleep_ms(3000)
    try:
        s = socket.socket()
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('0.0.0.0', _OTA_PORT))
        s.listen(1)
        while True:
            cl, _ = s.accept()
            try:
                _ota_atender(cl)
            except Exception as e:
                print('OTA: erro', e)
            finally:
                try:
                    cl.close()
                except Exception:
                    pass
    except Exception as e:
        print('OTA:', e)


_ota_ativo = True  # o main.py ve isto e nao liga o receptor de novo
_thread.stack_size(32 * 1024)
_thread.start_new_thread(_ota_servidor, ())
