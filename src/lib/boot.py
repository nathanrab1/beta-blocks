# boot.py instalado pelo Beta Blocks.
# Ao ligar, liga o Bluetooth (BLE): o app conecta sem cabo e envia, para, manda
# teclas e le o monitor de entradas (visor ao vivo so pelo cabo).
# Nao interfere no main.py.
import io
import os
import json
import time
import machine
import micropython

# Portas do kit (modulos 1-3, motores 4-7, LED 8-10, buzzer 13) em 0 V ao ligar, a cada reinicio
# e ao parar: nao ficam com o estado do programa anterior nem soltas (flutuando). Depois o
# programa transforma cada uma em entrada ou saida. O visor (11 e 12) fica de fora.
_PORTAS_KIT = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13)


def _zerar_portas():
    for p in _PORTAS_KIT:
        try:
            machine.Pin(p, machine.Pin.OUT, value=0)
        except Exception:
            pass


_zerar_portas()


def _limpar():
    """Ao parar e antes de reiniciar com um programa novo: apaga o visor, o LED e as portas.
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
        for t in ('_bb_timer', '_vis_timer', '_key_timer'):
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


# ---------- comandos por Bluetooth ----------
# Servico "UART" da Nordic (NUS). O app escreve no RX um comando por linha,
# "<id> <letra><resto>\n", e a placa responde gravando "<id> <resposta>" no
# valor do TX, que o app le (sem notificacoes):
#   ?        -> "ok mtu=N"  (o app escreve em pedacos que cabem no pacote)
#               A ultima ligacao manda: "?" derruba as outras (ex.: o celular que
#               saiu da pagina sem soltar a placa). "?r" e o app reconectando
#               sozinho: se outro aparelho ja esta ligado, responde "ocupada" e
#               o app desiste, em vez de tomar a placa de volta.
#   P        -> "parado"    (para o programa e zera LED, visor e portas)
#   K<nome>  -> tecla do computador ou do celular (sem resposta)
#   L        -> lista JSON das teclas que o programa rodando usa (botoes da
#               pagina de controle do celular)
#   U<n>     -> seguido de n bytes de JSON {arquivo: conteudo}: grava,
#               responde "gravado" e reinicia
# Monitor de entradas: o programa chama _ble_mon com a leitura (o mesmo JSON que
# vai pelo cabo) e ela fica no valor do MON, que o app le algumas vezes por
# segundo. O visor ao vivo so vai pelo cabo (sao quadros grandes).
#
# Por que nao o terminal (REPL) pelo Bluetooth, como o cabo: cada linha que a
# REPL imprimia virava um gatts_notify, chamado segurando a vez do Python (GIL),
# enquanto a tarefa do Bluetooth esperava essa mesma vez para entregar a escrita
# seguinte do app. Uma esperava a outra e a placa congelava inteira (nem o cabo
# respondia). Aqui a placa nunca chama o Bluetooth para enviar: so troca o valor
# do TX (gatts_write, que so copia na memoria) e o app vem ler.
#
# Teclado Bluetooth (HID): a placa tambem e um teclado. O computador pareia uma vez (nos
# Ajustes de Bluetooth) e o bloco "enviar letra" manda a tecla por _ble_teclado. As chaves do
# pareamento ficam em bb_ble_chaves.json: depois de cada envio/reinicio o computador reconecta
# sozinho. A ligacao pareada (criptografada) e a do teclado: o "?" do app nao a derruba.
#
# Cuidados:
# - a irq roda na tarefa do Bluetooth: so guarda os bytes e agenda _ble_processar,
#   que roda no programa principal. Uma excecao na irq desliga a irq para sempre.
# - a fila do micropython.schedule tem 8 lugares, dividida com os timers do
#   programa: fica no maximo um _ble_processar agendado por vez; se a fila estiver
#   cheia, tenta de novo quando o app ler a resposta.
# - excecao numa funcao agendada nao chega ao programa: para parar, P usa o
#   _bb_ctrl_c do programa e um Ctrl-C de uma vez so pelo os.dupterm.
import bluetooth
import binascii

_BLE_NUS = bluetooth.UUID('6E400001-B5A3-F393-E0A9-E50E24DCCA9E')
_BLE_RX = bluetooth.UUID('6E400002-B5A3-F393-E0A9-E50E24DCCA9E')  # app -> placa
_BLE_TX = bluetooth.UUID('6E400003-B5A3-F393-E0A9-E50E24DCCA9E')  # placa -> app
_BLE_MON = bluetooth.UUID('6E400004-B5A3-F393-E0A9-E50E24DCCA9E')  # monitor de entradas
_HID = bluetooth.UUID(0x1812)
_HID_INFO = bluetooth.UUID(0x2A4A)
_HID_MAPA = bluetooth.UUID(0x2A4B)
_HID_CONTROLE = bluetooth.UUID(0x2A4C)
_HID_RELATORIO = bluetooth.UUID(0x2A4D)
_HID_PROTOCOLO = bluetooth.UUID(0x2A4E)
_HID_REF = bluetooth.UUID(0x2908)  # "report reference": id 1, tipo entrada
_BATERIA = bluetooth.UUID(0x180F)
_BATERIA_NIVEL = bluetooth.UUID(0x2A19)
_INFO = bluetooth.UUID(0x180A)
_INFO_FABRICANTE = bluetooth.UUID(0x2A29)
_INFO_PNP = bluetooth.UUID(0x2A50)
# mapa do teclado (o mesmo do teclado USB, com "report id" 1 e sem os LEDs)
_HID_MAPA_VALOR = bytes((
    0x05, 0x01, 0x09, 0x06, 0xA1, 0x01, 0x85, 0x01,
    0x05, 0x07, 0x19, 0xE0, 0x29, 0xE7, 0x15, 0x00, 0x25, 0x01, 0x75, 0x01, 0x95, 0x08, 0x81, 0x02,
    0x95, 0x01, 0x75, 0x08, 0x81, 0x01,
    0x95, 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65, 0x05, 0x07, 0x19, 0x00, 0x29, 0x65, 0x81, 0x00,
    0xC0,
))
_CHAVES = 'bb_ble_chaves.json'  # pareamentos guardados (o computador reconecta sozinho)

# as mesmas portas que o Parar pelo cabo solta (resetBoardCode no app)
_BLE_PORTAS = tuple(range(1, 19)) + tuple(range(33, 45)) + (47, 48)


class _BleCtrlC(io.IOBase):
    # entrada de terminal que entrega um unico Ctrl-C: gera o KeyboardInterrupt
    # como o Ctrl-C do cabo, mesmo num programa que nao passa por _bb_ponto
    def __init__(self):
        self.n = 0

    def readinto(self, buf):
        if self.n and len(buf):
            self.n = 0
            buf[0] = 3
            return 1
        return None

    def write(self, buf):
        return len(buf)

    def ioctl(self, op, arg):
        if op == 3 and self.n:  # MP_STREAM_POLL: tem algo para ler
            return arg & 1
        return 0


def _ble_mon(s):
    # chamada pelo _monitor do programa (tambem de dentro de timer): so copia na memoria
    try:
        _ble_cmd._ble.gatts_write(_ble_cmd._mon, s)
    except Exception:
        pass


def _ble_salvar_chaves(_=None):
    try:
        c = _ble_cmd._chaves
        with open(_CHAVES, 'w') as f:
            h = lambda x: binascii.hexlify(x).decode()
            json.dump([[t, h(k), h(v)] for (t, k), v in c.items()], f)
    except Exception as e:
        print('Bluetooth chaves:', e)


def _ble_teclado(codigo):
    # chamada pelo programa (bloco "enviar letra"): aperta e solta a tecla no computador pareado
    try:
        return _ble_cmd._tecla(codigo)
    except Exception:
        return False


def _ble_parar():
    g = globals()
    g['_bb_rodando'] = False  # pilhas "ao iniciar" em threads saem dos lacos
    g['_bb_ctrl_c'] = True  # o programa para no proximo _bb_ponto()
    for i in range(4):
        try:
            machine.Timer(i).deinit()
        except Exception:
            pass
    _limpar()
    _ble_mon('')  # parado: sem leitura velha no app
    for p in _BLE_PORTAS:
        try:
            machine.Pin(p, machine.Pin.IN)
        except Exception:
            pass
    _zerar_portas()  # as do kit: 0 V, nao soltas
    c = _BleCtrlC()
    c.n = 1
    try:
        os.dupterm(c)
        os.dupterm_notify(None)
    except Exception:
        pass
    try:
        os.dupterm(None)
    except Exception:
        pass


def _ble_processar(ble):
    ble._agendado = False
    try:
        ble._processar()
    except Exception as e:
        print('Bluetooth:', e)


class _BleComandos:
    def __init__(self, nome):
        self._nome = nome.encode()
        self._conns = {}  # ligacoes abertas: conn -> tamanho do pacote (mtu)
        self._fila = []  # escritas do app, na ordem: (conn, bytes); bytes None = ligacao nova
        self._agendado = False
        self._bufs = {}  # conn -> bytes ainda sem fim de linha
        self._carga = None  # envio (U): pedacos recebidos
        self._carga_conn = None
        self._falta = 0
        self._id = b''
        self._hid = set()  # ligacoes pareadas (criptografadas): o computador usando o teclado
        self._chaves = {}  # (tipo, chave) -> valor: pareamentos guardados
        try:
            with open(_CHAVES) as f:
                for t, k, v in json.load(f):
                    self._chaves[(t, binascii.unhexlify(k))] = binascii.unhexlify(v)
        except Exception:
            pass
        b = self._ble = bluetooth.BLE()
        b.active(True)
        try:
            b.config(gap_name=nome, mtu=517)
        except Exception:
            pass
        try:  # pareamento sem senha (teclado nao tem tela), guardando as chaves
            b.config(bond=True, le_secure=True, mitm=False, io=3)
        except Exception:
            pass
        ((self._tx, self._rx, self._mon),
         (self._hid_info, self._hid_mapa, self._hid_ctrl, self._hid_rel, self._hid_ref, self._hid_prot),
         (self._bat,), (self._fab, self._pnp)) = b.gatts_register_services((
            (_BLE_NUS, ((_BLE_TX, 0x0002 | 0x0010), (_BLE_RX, 0x0008 | 0x0004),
                        (_BLE_MON, 0x0002))),  # read, notify; write; read
            (_HID, (
                (_HID_INFO, 0x0002),
                (_HID_MAPA, 0x0002 | 0x0200),  # ler o mapa exige pareamento: o computador pareia
                (_HID_CONTROLE, 0x0004),
                (_HID_RELATORIO, 0x0002 | 0x0010 | 0x0200, ((_HID_REF, 0x0002),)),
                (_HID_PROTOCOLO, 0x0002 | 0x0004),
            )),
            (_BATERIA, ((_BATERIA_NIVEL, 0x0002 | 0x0010),)),
            (_INFO, ((_INFO_FABRICANTE, 0x0002), (_INFO_PNP, 0x0002))),
        ))
        b.gatts_write(self._hid_info, bytes((0x11, 0x01, 0x00, 0x02)))  # HID 1.11, conectavel
        b.gatts_write(self._hid_mapa, _HID_MAPA_VALOR)
        b.gatts_write(self._hid_rel, bytes(8))
        b.gatts_write(self._hid_ref, bytes((1, 1)))  # report id 1, entrada
        b.gatts_write(self._hid_prot, bytes((1,)))  # modo "report"
        b.gatts_write(self._bat, bytes((100,)))
        b.gatts_write(self._fab, b'Beta Kit')
        b.gatts_write(self._pnp, bytes((0x02, 0xE5, 0x02, 0x01, 0xBB, 0x00, 0x01)))  # USB, vid/pid/versao
        b.gatts_set_buffer(self._rx, 512, True)
        b.gatts_set_buffer(self._tx, 512)  # a lista de teclas pode ser longa
        b.gatts_set_buffer(self._mon, 256)
        b.irq(self._irq)
        self._anunciar()

    def _anunciar(self):
        # nome no anuncio (aparece na lista do Chrome) e o servico na resposta ao scan.
        # Continua anunciando mesmo com uma ligacao aberta: outro aparelho pode tomar a placa.
        # aparencia "teclado" (0x03C1) e o servico HID (0x1812): o computador mostra como teclado
        adv = (b'\x02\x01\x06' + b'\x03\x19\xc1\x03' + b'\x03\x03\x12\x18'
               + bytes((len(self._nome) + 1, 0x09)) + self._nome)
        resp = b'\x11\x07' + bytes(_BLE_NUS)
        try:
            self._ble.gap_advertise(100000, adv_data=adv, resp_data=resp)
        except Exception:
            pass  # sem vaga para mais uma ligacao: volta a anunciar quando uma fechar

    def _irq(self, ev, dados):
        try:
            if ev == 3:  # app escreveu
                if dados[1] == self._rx:
                    self._fila.append((dados[0], self._ble.gatts_read(self._rx)))
                    self._agendar()
            elif ev == 4:  # app vai ler a resposta: se o agendamento falhou, tenta de novo
                if self._fila:
                    self._agendar()
            elif ev == 1:  # app conectou
                self._conns[dados[0]] = 23
                self._fila.append((dados[0], None))
                self._agendar()
                self._anunciar()
            elif ev == 2:  # app (ou o computador do teclado) desconectou
                self._conns.pop(dados[0], None)
                self._bufs.pop(dados[0], None)
                self._hid.discard(dados[0])
                if self._carga_conn == dados[0]:
                    self._carga = None
                self._anunciar()
            elif ev == 21:  # tamanho do pacote combinado com o app
                if dados[0] in self._conns:
                    self._conns[dados[0]] = dados[1]
            elif ev == 28:  # ligacao criptografada (pareada): e o computador usando o teclado
                if dados[1]:
                    self._hid.add(dados[0])
            elif ev == 29:  # o Bluetooth pede uma chave guardada
                return self._chave(*dados)
            elif ev == 30:  # o Bluetooth quer guardar (ou apagar) uma chave
                t, k, v = dados
                k = bytes(k)
                if v is None:
                    self._chaves.pop((t, k), None)
                else:
                    self._chaves[(t, k)] = bytes(v)
                try:  # gravar o arquivo fora da irq
                    micropython.schedule(_ble_salvar_chaves, None)
                except RuntimeError:
                    pass
                return True
        except Exception:
            pass

    def _chave(self, t, i, k):
        if k is None:  # a i-esima chave desse tipo
            n = 0
            for (tt, _), v in self._chaves.items():
                if tt == t:
                    if n == i:
                        return v
                    n += 1
            return None
        return self._chaves.get((t, bytes(k)), None)

    def _tecla(self, codigo):
        # aperta e solta a tecla em cada computador pareado; False se nenhum estiver ligado
        if not self._hid:
            return False
        for c in list(self._hid):
            try:
                self._ble.gatts_notify(c, self._hid_rel, bytes((0, 0, codigo, 0, 0, 0, 0, 0)))
                time.sleep_ms(15)
                self._ble.gatts_notify(c, self._hid_rel, bytes(8))
            except Exception:
                pass
        return True

    def _agendar(self):
        if self._agendado:
            return
        self._agendado = True
        try:
            micropython.schedule(_ble_processar, self)
        except RuntimeError:  # fila cheia
            self._agendado = False

    def _responder(self, id_, msg):
        self._ble.gatts_write(self._tx, id_ + b' ' + msg.encode())

    def _processar(self):
        f = self._fila
        while f:
            conn, d = f.pop(0)
            if d is None:  # ligacao nova: comeca do zero
                self._bufs[conn] = b''
                continue
            if conn not in self._conns:  # escrita de uma ligacao que ja caiu
                continue
            buf = self._bufs.get(conn, b'') + d
            while buf:
                if self._carga is not None and self._carga_conn == conn:
                    n = min(self._falta, len(buf))
                    self._carga.append(buf[:n])
                    buf = buf[n:]
                    self._falta -= n
                    if not self._falta:
                        self._gravar()
                    continue
                i = buf.find(b'\n')
                if i < 0:
                    break
                linha = buf[:i]
                buf = buf[i + 1:]
                self._comando(conn, linha)
            self._bufs[conn] = buf

    def _comando(self, conn, linha):
        id_, _, cmd = linha.partition(b' ')
        k, arg = cmd[:1], cmd[1:]
        try:
            if k == b'?':
                # o computador pareado (teclado) nao conta: fica ligado junto com o app
                outras = [c for c in self._conns if c != conn and c not in self._hid]
                if arg == b'r' and outras:
                    self._responder(id_, 'ocupada')  # o app desiste e solta esta ligacao
                    return
                for c in outras:  # a ultima ligacao manda
                    try:
                        self._ble.gap_disconnect(c)
                    except Exception:
                        pass
                self._responder(id_, 'ok mtu=%d' % self._conns.get(conn, 23))
            elif k == b'P':
                _ble_parar()
                self._responder(id_, 'parado')
            elif k == b'L':
                self._responder(id_, json.dumps(sorted(globals().get('_teclas', {}))))
            elif k == b'K':
                f = globals().get('_teclas', {}).get(arg.decode())
                if f:
                    f()
            elif k == b'U':
                self._id = id_
                self._falta = int(arg)
                self._carga = []
                self._carga_conn = conn
                if not self._falta:
                    self._gravar()
        except Exception as e:
            self._responder(id_, 'erro %s' % e)

    def _gravar(self):
        carga, self._carga = self._carga, None
        try:
            arquivos = json.loads(b''.join(carga).decode())
            carga = None
            for nome, conteudo in arquivos.items():
                with open(nome, 'w') as f:
                    f.write(conteudo)
        except Exception as e:
            self._responder(self._id, 'erro %s' % e)
            return
        self._responder(self._id, 'gravado')
        time.sleep_ms(800)  # tempo para o app ler a resposta
        _limpar()
        machine.reset()


try:
    _uid = machine.unique_id()
    _ble_nome = 'Beta-%02X%02X' % (_uid[-2], _uid[-1])
    _ble_cmd = _BleComandos(_ble_nome)
    print('Bluetooth:', _ble_nome)
except Exception as e:
    print('Bluetooth:', e)

