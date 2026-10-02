# Driver SSD1306 (OLED I2C) - baseado no micropython-lib (licenca MIT)
from micropython import const
import framebuf

SET_CONTRAST = const(0x81)
SET_ENTIRE_ON = const(0xA4)
SET_NORM_INV = const(0xA6)
SET_DISP = const(0xAE)
SET_MEM_ADDR = const(0x20)
SET_COL_ADDR = const(0x21)
SET_PAGE_ADDR = const(0x22)
SET_DISP_START_LINE = const(0x40)
SET_SEG_REMAP = const(0xA0)
SET_MUX_RATIO = const(0xA8)
SET_IREF_SELECT = const(0xAD)
SET_COM_OUT_DIR = const(0xC0)
SET_DISP_OFFSET = const(0xD3)
SET_COM_PIN_CFG = const(0xDA)
SET_DISP_CLK_DIV = const(0xD5)
SET_PRECHARGE = const(0xD9)
SET_VCOM_DESEL = const(0xDB)
SET_CHARGE_PUMP = const(0x8D)


class SSD1306(framebuf.FrameBuffer):
    def __init__(self, width, height, external_vcc):
        self.width = width
        self.height = height
        self.external_vcc = external_vcc
        self.pages = self.height // 8
        self.buffer = bytearray(self.pages * self.width)
        self._enviado = None  # copia do que a tela ja mostra (o show manda so o que mudou)
        super().__init__(self.buffer, self.width, self.height, framebuf.MONO_VLSB)
        self.init_display()

    def init_display(self):
        for cmd in (
            SET_DISP,
            SET_MEM_ADDR, 0x00,
            SET_DISP_START_LINE,
            SET_SEG_REMAP | 0x01,
            SET_MUX_RATIO, self.height - 1,
            SET_COM_OUT_DIR | 0x08,
            SET_DISP_OFFSET, 0x00,
            SET_COM_PIN_CFG, 0x02 if self.width > 2 * self.height else 0x12,
            SET_DISP_CLK_DIV, 0x80,
            SET_PRECHARGE, 0x22 if self.external_vcc else 0xF1,
            SET_VCOM_DESEL, 0x30,
            SET_CONTRAST, 0xFF,
            SET_ENTIRE_ON,
            SET_NORM_INV,
            SET_IREF_SELECT, 0x30,
            SET_CHARGE_PUMP, 0x10 if self.external_vcc else 0x14,
            SET_DISP | 0x01,
        ):
            self.write_cmd(cmd)
        self.fill(0)
        self.show()

    def poweroff(self):
        self.write_cmd(SET_DISP)

    def poweron(self):
        self.write_cmd(SET_DISP | 0x01)

    def contrast(self, contrast):
        self.write_cmd(SET_CONTRAST)
        self.write_cmd(contrast)

    def invert(self, invert):
        self.write_cmd(SET_NORM_INV | (invert & 1))

    def rotate(self, rotate):
        self.write_cmd(SET_COM_OUT_DIR | ((rotate & 1) << 3))
        self.write_cmd(SET_SEG_REMAP | (rotate & 1))

    def write_cmds(self, cmds):
        for c in cmds:
            self.write_cmd(c)

    # Beta Blocks: manda so a faixa de paginas (linhas de 8 px) que mudou desde o ultimo show.
    # A tela inteira leva ~23 ms no I2C a 400 kHz; nos jogos boa parte dela fica igual.
    def show(self):
        x0 = 0
        x1 = self.width - 1
        if self.width != 128:
            col_offset = (128 - self.width) // 2
            x0 += col_offset
            x1 += col_offset
        w = self.width
        antes = self._enviado
        if antes is None:
            p0, p1 = 0, self.pages - 1
        else:
            p0 = p1 = -1
            for p in range(self.pages):
                a = p * w
                if self.buffer[a:a + w] != antes[a:a + w]:
                    if p0 < 0:
                        p0 = p
                    p1 = p
            if p0 < 0:
                return  # nada mudou
        self.write_cmds((SET_COL_ADDR, x0, x1, SET_PAGE_ADDR, p0, p1))
        a, b = p0 * w, (p1 + 1) * w
        self.write_data(memoryview(self.buffer)[a:b])
        if antes is None:
            self._enviado = bytearray(self.buffer)
        else:
            antes[a:b] = self.buffer[a:b]


class SSD1306_I2C(SSD1306):
    def __init__(self, width, height, i2c, addr=0x3C, external_vcc=False):
        self.i2c = i2c
        self.addr = addr
        self.temp = bytearray(2)
        self.write_list = [b"\x40", None]
        super().__init__(width, height, external_vcc)

    def write_cmd(self, cmd):
        self.temp[0] = 0x80
        self.temp[1] = cmd
        self.i2c.writeto(self.addr, self.temp)

    def write_cmds(self, cmds):  # varios comandos num envio so (byte de controle 0x00)
        self.i2c.writeto(self.addr, b"\x00" + bytes(cmds))

    def write_data(self, buf):
        self.write_list[1] = buf
        self.i2c.writevto(self.addr, self.write_list)
