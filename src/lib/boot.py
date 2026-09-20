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
        time.sleep_ms(300)
        machine.reset()
    else:
        cl.write(b'HTTP/1.0 404 Not Found\r\nConnection: close\r\n\r\n')


def _ota_servidor():
    try:
        import network
        with open('wifi.json') as f:
            cfg = json.load(f)
        wlan = network.WLAN(network.STA_IF)
        wlan.active(True)
        try:
            wlan.config(pm=network.WLAN.PM_NONE)  # sem economia de energia: responde sempre
        except Exception:
            pass
        if not wlan.isconnected():
            wlan.connect(cfg['ssid'], cfg['senha'])
            for _ in range(150):
                if wlan.isconnected():
                    break
                time.sleep_ms(100)
        if not wlan.isconnected():
            return
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
    except OSError:
        pass  # sem wifi.json: nunca conectou no Wi-Fi ainda
    except Exception as e:
        print('OTA:', e)


_thread.stack_size(32 * 1024)
_thread.start_new_thread(_ota_servidor, ())
