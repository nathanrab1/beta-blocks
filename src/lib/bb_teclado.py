# Teclado USB (HID) para o Beta Blocks: usb-device + usb-device-hid + usb-device-keyboard do
# micropython-lib (licenca MIT; Copyright (c) 2022-2024 Angus Gratton) num arquivo so, sem
# comentarios, porque o envio do app nao cria pastas na placa.
from micropython import const
import machine
import struct
try:
    from _thread import get_ident
except ImportError:

    def get_ident():
        return 0
_EP_IN_FLAG = const(1 << 7)
_STD_DESC_DEV_TYPE = const(1)
_STD_DESC_CONFIG_TYPE = const(2)
_STD_DESC_STRING_TYPE = const(3)
_STD_DESC_INTERFACE_TYPE = const(4)
_STD_DESC_ENDPOINT_TYPE = const(5)
_STD_DESC_INTERFACE_ASSOC = const(11)
_ITF_ASSOCIATION_DESC_TYPE = const(11)
_STD_DESC_CONFIG_LEN = const(9)
_STD_DESC_ENDPOINT_LEN = const(7)
_STD_DESC_INTERFACE_LEN = const(9)
_DESC_OFFSET_LEN = const(0)
_DESC_OFFSET_TYPE = const(1)
_DESC_OFFSET_INTERFACE_NUM = const(2)
_DESC_OFFSET_ENDPOINT_NUM = const(2)
_REQ_RECIPIENT_DEVICE = const(0)
_REQ_RECIPIENT_INTERFACE = const(1)
_REQ_RECIPIENT_ENDPOINT = const(2)
_REQ_RECIPIENT_OTHER = const(3)
_OFFS_CONFIG_iConfiguration = const(6)
_INTERFACE_CLASS_VENDOR = const(255)
_INTERFACE_SUBCLASS_NONE = const(0)
_PROTOCOL_NONE = const(0)
_USB_STR_MANUF = const(1)
_USB_STR_PRODUCT = const(2)
_USB_STR_SERIAL = const(3)
_MP_EINVAL = const(22)
_dev = None

def get():
    global _dev
    if not _dev:
        _dev = _Device()
    return _dev

class _Device:

    def __init__(self):
        self._itfs = {}
        self._eps = {}
        self._ep_cbs = {}
        self._cb_thread = None
        self._cb_ep = None
        self._usbd = machine.USBDevice()

    def init(self, *itfs, **kwargs):
        self.active(False)
        self.config(*itfs, **kwargs)
        self.active(True)

    def config(self, *itfs, builtin_driver=False, manufacturer_str=None, product_str=None, serial_str=None, configuration_str=None, id_vendor=None, id_product=None, bcd_device=None, device_class=0, device_subclass=0, device_protocol=0, config_str=None, max_power_ma=None, remote_wakeup=False):
        _usbd = self._usbd
        if self.active():
            raise OSError(_MP_EINVAL)
        if isinstance(builtin_driver, bool):
            builtin_driver = _usbd.BUILTIN_DEFAULT if builtin_driver else _usbd.BUILTIN_NONE
        _usbd.builtin_driver = builtin_driver
        strs = [None, manufacturer_str, product_str, serial_str]
        FMT = '<BBHBBBBHHHBBBB'
        f = struct.unpack(FMT, builtin_driver.desc_dev)

        def maybe_set(value, idx):
            if value is not None:
                return value
            return f[idx]
        desc_dev = struct.pack(FMT, f[0], f[1], f[2], device_class, device_subclass, device_protocol, f[6], maybe_set(id_vendor, 7), maybe_set(id_product, 8), maybe_set(bcd_device, 9), _USB_STR_MANUF, _USB_STR_PRODUCT, _USB_STR_SERIAL, 1)
        itf_num = builtin_driver.itf_max
        ep_num = max(builtin_driver.ep_max, 1)
        while len(strs) < builtin_driver.str_max:
            strs.append(None)
        initial_cfg = builtin_driver.desc_cfg or b'\x00' * _STD_DESC_CONFIG_LEN
        self._itfs = {}
        desc = Descriptor(None)
        desc.extend(initial_cfg)
        for itf in itfs:
            itf.desc_cfg(desc, 0, 0, [])
        desc = Descriptor(bytearray(desc.o))
        desc.extend(initial_cfg)
        for itf in itfs:
            itf.desc_cfg(desc, itf_num, ep_num, strs)
            for _ in range(itf.num_itfs()):
                self._itfs[itf_num] = itf
                itf_num += 1
            ep_num += itf.num_eps()
        bmAttributes = 1 << 7 | (0 if max_power_ma else 1 << 6) | (1 << 5 if remote_wakeup else 0)
        iConfiguration = 0
        if configuration_str:
            iConfiguration = len(strs)
            strs.append(configuration_str)
        if max_power_ma is not None:
            max_power_ma //= 2
        else:
            try:
                max_power_ma = _usbd.BUILTIN_DEFAULT.desc_cfg[8]
            except IndexError:
                max_power_ma = 125
        desc.pack_into('<BBHBBBBB', 0, _STD_DESC_CONFIG_LEN, _STD_DESC_CONFIG_TYPE, len(desc.b), itf_num, 1, iConfiguration, bmAttributes, max_power_ma)
        _usbd.config(desc_dev, desc.b, strs, self._open_itf_cb, self._reset_cb, self._control_xfer_cb, self._xfer_cb)

    def active(self, *optional_value):
        return self._usbd.active(*optional_value)

    def _open_itf_cb(self, desc):
        itf_num = desc[_DESC_OFFSET_INTERFACE_NUM]
        itf = self._itfs[itf_num]
        offs = 0
        max_itf = itf_num
        while offs < len(desc):
            dl = desc[offs + _DESC_OFFSET_LEN]
            dt = desc[offs + _DESC_OFFSET_TYPE]
            if dt == _STD_DESC_ENDPOINT_TYPE:
                ep_addr = desc[offs + _DESC_OFFSET_ENDPOINT_NUM]
                self._eps[ep_addr] = itf
                self._ep_cbs[ep_addr] = None
            elif dt == _STD_DESC_INTERFACE_TYPE:
                max_itf = max(max_itf, desc[offs + _DESC_OFFSET_INTERFACE_NUM])
            offs += dl
        if self._itfs.get(max_itf + 1, None) != itf:
            itf.on_open()

    def _reset_cb(self):
        for itf in self._itfs.values():
            itf.on_reset()
        self._eps = {}
        self._ep_cbs = {}

    def _submit_xfer(self, ep_addr, data, done_cb=None):
        if ep_addr not in self._eps:
            raise ValueError('ep_addr')
        if self._xfer_pending(ep_addr):
            raise RuntimeError('xfer_pending')
        self._ep_cbs[ep_addr] = done_cb or True
        return self._usbd.submit_xfer(ep_addr, data)

    def _xfer_pending(self, ep_addr):
        return self._ep_cbs[ep_addr] or (self._cb_ep == ep_addr and self._cb_thread != get_ident())

    def _xfer_cb(self, ep_addr, result, xferred_bytes):
        cb = self._ep_cbs.get(ep_addr, None)
        self._cb_thread = get_ident()
        self._cb_ep = ep_addr
        self._ep_cbs[ep_addr] = None
        try:
            if callable(cb):
                cb(ep_addr, result, xferred_bytes)
        finally:
            self._cb_ep = None

    def _control_xfer_cb(self, stage, request):
        wIndex = request[4] + (request[5] << 8)
        (recipient, _, _) = split_bmRequestType(request[0])
        itf = None
        result = None
        if recipient == _REQ_RECIPIENT_DEVICE:
            itf = self._itfs.get(wIndex & 65535, None)
            if itf:
                result = itf.on_device_control_xfer(stage, request)
        elif recipient == _REQ_RECIPIENT_INTERFACE:
            itf = self._itfs.get(wIndex & 65535, None)
            if itf:
                result = itf.on_interface_control_xfer(stage, request)
        elif recipient == _REQ_RECIPIENT_ENDPOINT:
            ep_num = wIndex & 65535
            itf = self._eps.get(ep_num, None)
            if itf:
                result = itf.on_endpoint_control_xfer(stage, request)
        if not itf:
            raise RuntimeError(f'Unexpected control request type {request[0]:#x}')
        return result

class Interface:

    def __init__(self):
        self._open = False

    def desc_cfg(self, desc, itf_num, ep_num, strs):
        raise NotImplementedError

    def num_itfs(self):
        return 1

    def num_eps(self):
        return 0

    def on_open(self):
        self._open = True

    def on_reset(self):
        self._open = False

    def is_open(self):
        return self._open

    def on_device_control_xfer(self, stage, request):
        return False

    def on_interface_control_xfer(self, stage, request):
        return False

    def on_endpoint_control_xfer(self, stage, request):
        return False

    def xfer_pending(self, ep_addr):
        return _dev and _dev._xfer_pending(ep_addr)

    def submit_xfer(self, ep_addr, data, done_cb=None):
        if not self._open:
            raise RuntimeError('Not open')
        if not _dev._submit_xfer(ep_addr, data, done_cb):
            raise RuntimeError('DCD error')

    def stall(self, ep_addr, *args):
        if not self._open or ep_addr not in self._eps:
            raise RuntimeError
        _dev._usbd.stall(ep_addr, *args)

class Descriptor:

    def __init__(self, b):
        self.b = b
        self.o = 0

    def pack(self, fmt, *args):
        self.pack_into(fmt, self.o, *args)

    def pack_into(self, fmt, offs, *args):
        end = offs + struct.calcsize(fmt)
        if self.b:
            struct.pack_into(fmt, self.b, offs, *args)
        self.o = max(self.o, end)

    def extend(self, a):
        if self.b:
            self.b[self.o:self.o + len(a)] = a
        self.o += len(a)

    def interface(self, bInterfaceNumber, bNumEndpoints, bInterfaceClass=_INTERFACE_CLASS_VENDOR, bInterfaceSubClass=_INTERFACE_SUBCLASS_NONE, bInterfaceProtocol=_PROTOCOL_NONE, iInterface=0):
        self.pack('BBBBBBBBB', _STD_DESC_INTERFACE_LEN, _STD_DESC_INTERFACE_TYPE, bInterfaceNumber, 0, bNumEndpoints, bInterfaceClass, bInterfaceSubClass, bInterfaceProtocol, iInterface)

    def endpoint(self, bEndpointAddress, bmAttributes, wMaxPacketSize, bInterval=1):
        if bmAttributes == 'control':
            bmAttributes = 0
        elif bmAttributes == 'bulk':
            bmAttributes = 2
        elif bmAttributes == 'interrupt':
            bmAttributes = 3
        self.pack('<BBBBHB', _STD_DESC_ENDPOINT_LEN, _STD_DESC_ENDPOINT_TYPE, bEndpointAddress, bmAttributes, wMaxPacketSize, bInterval)

    def interface_assoc(self, bFirstInterface, bInterfaceCount, bFunctionClass, bFunctionSubClass, bFunctionProtocol=_PROTOCOL_NONE, iFunction=0):
        self.pack('<BBBBBBBB', 8, _ITF_ASSOCIATION_DESC_TYPE, bFirstInterface, bInterfaceCount, bFunctionClass, bFunctionSubClass, bFunctionProtocol, iFunction)

def split_bmRequestType(bmRequestType):
    return (bmRequestType & 31, bmRequestType >> 5 & 3, bmRequestType >> 7 & 1)

class Buffer:

    def __init__(self, length):
        self._b = memoryview(bytearray(length))
        self._n = 0
        self._w = length

    def writable(self):
        return len(self._b) - self._n

    def readable(self):
        return self._n

    def pend_write(self, wmax=None):
        self._w = self._n
        end = self._w + wmax if wmax else len(self._b)
        return self._b[self._w:end]

    def finish_write(self, nbytes):
        ist = machine.disable_irq()
        try:
            assert nbytes <= len(self._b) - self._w
            if self._n == self._w:
                self._n += nbytes
            else:
                while nbytes > 0:
                    self._b[self._n] = self._b[self._w]
                    self._n += 1
                    self._w += 1
                    nbytes -= 1
            self._w = len(self._b)
        finally:
            machine.enable_irq(ist)

    def write(self, w):
        pw = self.pend_write()
        to_w = min(len(w), len(pw))
        if to_w:
            pw[:to_w] = w[:to_w]
            self.finish_write(to_w)
        return to_w

    def pend_read(self):
        return self._b[:self._n]

    def finish_read(self, nbytes):
        if not nbytes:
            return
        ist = machine.disable_irq()
        try:
            assert nbytes <= self._n
            i = 0
            self._n -= nbytes
            while i < self._n:
                self._b[i] = self._b[i + nbytes]
                i += 1
        finally:
            machine.enable_irq(ist)

    def readinto(self, b):
        pr = self.pend_read()
        to_r = min(len(pr), len(b))
        if to_r:
            b[:to_r] = pr[:to_r]
            self.finish_read(to_r)
        return to_r
import time
_STAGE_IDLE = const(0)
_STAGE_SETUP = const(1)
_STAGE_DATA = const(2)
_STAGE_ACK = const(3)
_REQ_TYPE_STANDARD = const(0)
_REQ_TYPE_CLASS = const(1)
_REQ_TYPE_VENDOR = const(2)
_REQ_TYPE_RESERVED = const(3)
_DESC_HID_TYPE = const(33)
_DESC_REPORT_TYPE = const(34)
_DESC_PHYSICAL_TYPE = const(35)
_INTERFACE_CLASS = const(3)
_INTERFACE_SUBCLASS_BOOT = const(1)
_INTERFACE_PROTOCOL_NONE = const(0)
_INTERFACE_PROTOCOL_KEYBOARD = const(1)
_INTERFACE_PROTOCOL_MOUSE = const(2)
_REQ_CONTROL_GET_REPORT = const(1)
_REQ_CONTROL_GET_IDLE = const(2)
_REQ_CONTROL_GET_PROTOCOL = const(3)
_REQ_CONTROL_GET_DESCRIPTOR = const(6)
_REQ_CONTROL_SET_REPORT = const(9)
_REQ_CONTROL_SET_IDLE = const(10)
_REQ_CONTROL_SET_PROTOCOL = const(11)

class HIDInterface(Interface):

    def __init__(self, report_descriptor, extra_descriptors=[], set_report_buf=None, protocol=_INTERFACE_PROTOCOL_NONE, interface_str=None, interval_ms=8):
        super().__init__()
        self.report_descriptor = report_descriptor
        self.extra_descriptors = extra_descriptors
        self._set_report_buf = set_report_buf
        self.protocol = protocol
        self.interface_str = interface_str
        self.interval_ms = interval_ms
        self._int_ep = None

    def get_report(self):
        return False

    def on_set_report(self, report_data, report_id, report_type):
        return True

    def busy(self):
        return self.is_open() and self.xfer_pending(self._int_ep)

    def send_report(self, report_data, timeout_ms=100):
        deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
        while self.busy():
            if time.ticks_diff(deadline, time.ticks_ms()) <= 0:
                return False
            machine.idle()
        if not self.is_open():
            return False
        self.submit_xfer(self._int_ep, report_data)
        return True

    def desc_cfg(self, desc, itf_num, ep_num, strs):
        desc.interface(itf_num, 1, _INTERFACE_CLASS, _INTERFACE_SUBCLASS_NONE if self.protocol == _INTERFACE_PROTOCOL_NONE else _INTERFACE_SUBCLASS_BOOT, self.protocol, len(strs) if self.interface_str else 0)
        if self.interface_str:
            strs.append(self.interface_str)
        self.get_hid_descriptor(desc)
        self._int_ep = ep_num | _EP_IN_FLAG
        desc.endpoint(self._int_ep, 'interrupt', 8, self.interval_ms)
        self.idle_rate = 0
        self.protocol = 1

    def num_eps(self):
        return 1

    def get_hid_descriptor(self, desc=None):
        l = 9 + 3 * len(self.extra_descriptors)
        if desc is None:
            desc = Descriptor(bytearray(l))
        desc.pack('<BBHBBBH', l, _DESC_HID_TYPE, 273, 0, len(self.extra_descriptors) + 1, 34, len(self.report_descriptor))
        for (dt, dd) in self.extra_descriptors:
            desc.pack('<BH', dt, len(dd))
        return desc.b

    def on_interface_control_xfer(self, stage, request):
        (bmRequestType, bRequest, wValue, _, wLength) = struct.unpack('BBHHH', request)
        (recipient, req_type, _) = split_bmRequestType(bmRequestType)
        if stage == _STAGE_SETUP:
            if req_type == _REQ_TYPE_STANDARD:
                if bRequest == _REQ_CONTROL_GET_DESCRIPTOR:
                    desc_type = wValue >> 8
                    if desc_type == _DESC_HID_TYPE:
                        return self.get_hid_descriptor()
                    if desc_type == _DESC_REPORT_TYPE:
                        self.protocol = 1
                        return self.report_descriptor
            elif req_type == _REQ_TYPE_CLASS:
                if bRequest == _REQ_CONTROL_GET_REPORT:
                    print('GET_REPORT?')
                    return False
                if bRequest == _REQ_CONTROL_GET_IDLE:
                    return bytes([self.idle_rate])
                if bRequest == _REQ_CONTROL_GET_PROTOCOL:
                    return bytes([self.protocol])
                if bRequest in (_REQ_CONTROL_SET_IDLE, _REQ_CONTROL_SET_PROTOCOL):
                    return True
                if bRequest == _REQ_CONTROL_SET_REPORT:
                    return self._set_report_buf
            return False
        if stage == _STAGE_ACK:
            if req_type == _REQ_TYPE_CLASS:
                if bRequest == _REQ_CONTROL_SET_IDLE:
                    self.idle_rate = wValue >> 8
                elif bRequest == _REQ_CONTROL_SET_PROTOCOL:
                    self.protocol = wValue
                elif bRequest == _REQ_CONTROL_SET_REPORT:
                    report_id = wValue & 255
                    report_type = wValue >> 8
                    report_data = self._set_report_buf
                    if wLength < len(report_data):
                        report_data = memoryview(self._set_report_buf)[:wLength]
                    self.on_set_report(report_data, report_id, report_type)
        return True
_KEY_ARRAY_LEN = const(6)
_KEY_REPORT_LEN = const(_KEY_ARRAY_LEN + 2)

class KeyboardInterface(HIDInterface):

    def __init__(self):
        super().__init__(_KEYBOARD_REPORT_DESC, set_report_buf=bytearray(1), protocol=_INTERFACE_PROTOCOL_KEYBOARD, interface_str='MicroPython Keyboard')
        self._key_reports = [bytearray(_KEY_REPORT_LEN), bytearray(_KEY_REPORT_LEN)]
        self.numlock = False

    def on_set_report(self, report_data, _report_id, _report_type):
        self.on_led_update(report_data[0])

    def on_led_update(self, led_mask):
        pass

    def send_keys(self, down_keys, timeout_ms=100):
        (r, s) = self._key_reports
        r[0] = 0
        i = 2
        for k in down_keys:
            if k < 0:
                r[0] |= -k
            elif i < _KEY_REPORT_LEN:
                r[i] = k
                i += 1
            else:
                r[0] = 0
                for i in range(2, _KEY_REPORT_LEN):
                    r[i] = 255
                break
        while i < _KEY_REPORT_LEN:
            r[i] = 0
            i += 1
        if self.send_report(r, timeout_ms):
            self._key_reports[0] = s
            self._key_reports[1] = r
            return True
        return False
_KEYBOARD_REPORT_DESC = b'\x05\x01\t\x06\xa1\x01\x05\x07\x19\xe0)\xe7\x15\x00%\x01u\x01\x95\x08\x81\x02\x95\x01u\x08\x81\x01\x95\x05u\x01\x05\x08\x19\x01)\x05\x91\x02\x95\x01u\x03\x91\x01\x95\x06u\x08\x15\x00%e\x05\x07\x19\x00)e\x81\x00\xc0'

class KeyCode:
    A = 4
    B = 5
    C = 6
    D = 7
    E = 8
    F = 9
    G = 10
    H = 11
    I = 12
    J = 13
    K = 14
    L = 15
    M = 16
    N = 17
    O = 18
    P = 19
    Q = 20
    R = 21
    S = 22
    T = 23
    U = 24
    V = 25
    W = 26
    X = 27
    Y = 28
    Z = 29
    N1 = 30
    N2 = 31
    N3 = 32
    N4 = 33
    N5 = 34
    N6 = 35
    N7 = 36
    N8 = 37
    N9 = 38
    N0 = 39
    ENTER = 40
    ESCAPE = 41
    BACKSPACE = 42
    TAB = 43
    SPACE = 44
    MINUS = 45
    EQUAL = 46
    OPEN_BRACKET = 47
    CLOSE_BRACKET = 48
    BACKSLASH = 49
    HASH = 50
    SEMICOLON = 51
    QUOTE = 52
    GRAVE = 53
    COMMA = 54
    DOT = 55
    SLASH = 56
    CAPS_LOCK = 57
    F1 = 58
    F2 = 59
    F3 = 60
    F4 = 61
    F5 = 62
    F6 = 63
    F7 = 64
    F8 = 65
    F9 = 66
    F10 = 67
    F11 = 68
    F12 = 69
    PRINTSCREEN = 70
    SCROLL_LOCK = 71
    PAUSE = 72
    INSERT = 73
    HOME = 74
    PAGEUP = 75
    DELETE = 76
    END = 77
    PAGEDOWN = 78
    RIGHT = 79
    LEFT = 80
    DOWN = 81
    UP = 82
    KP_NUM_LOCK = 83
    KP_DIVIDE = 84
    KP_AT = 85
    KP_MULTIPLY = 85
    KP_MINUS = 86
    KP_PLUS = 87
    KP_ENTER = 88
    KP_1 = 89
    KP_2 = 90
    KP_3 = 91
    KP_4 = 92
    KP_5 = 93
    KP_6 = 94
    KP_7 = 95
    KP_8 = 96
    KP_9 = 97
    KP_0 = 98
    LEFT_CTRL = -1
    LEFT_SHIFT = -2
    LEFT_ALT = -4
    LEFT_UI = -8
    RIGHT_CTRL = -16
    RIGHT_SHIFT = -32
    RIGHT_ALT = -64
    RIGHT_UI = -128

class LEDCode:
    NUM_LOCK = 1
    CAPS_LOCK = 2
    SCROLL_LOCK = 4
    COMPOSE = 8
    KANA = 16
