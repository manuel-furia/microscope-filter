import time
import board
import math
import busio
import bitmaptools
import displayio
import gc9a01
import usb_cdc
import gc
import binascii

serial = usb_cdc.console

displayio.release_displays()

# Raspberry Pi Pico pinout, one possibility, at "southwest" of board
tft_clk = board.GP10 # must be a SPI CLK
tft_mosi= board.GP11 # must be a SPI TX
tft_rst = board.GP12
tft_dc  = board.GP13
tft_cs  = board.GP14
spi = busio.SPI(clock=tft_clk, MOSI=tft_mosi)
display_bus = displayio.FourWire(spi, command=tft_dc, chip_select=tft_cs, reset=tft_rst)
display = gc9a01.GC9A01(display_bus, width=240, height=240, auto_refresh=False, brightness=0.0)


# Make the main display context
main = displayio.Group() 

palette = displayio.Palette(8)
animations = []

class BitmapKeyFrame:
    def __init__(self, index, x, y, visible):
        self.index = index
        self.x = x
        self.y = y
        self.visible = visible
        self.type = "bitmapkf"

class PaletteKeyFrame:
    def __init__(self, index, r, g, b):
        self.index = index
        self.r = r
        self.g = g
        self.b = b
        self.type = "palettekf"

class PaletteHandler:
    def __init__(self):
        self.palette = []

    def append(self, color):
        self.palette.append(color)

    def modify(self, index, color):
        if index < len(self.palette):
            self.palette[index] = color
    
    def __len__(self):
        return len(self.palette)
    
    def make_palette(self):
        palette = displayio.Palette(len(self.palette))
        for i in range(len(self.palette)):
            palette[i] = self.palette[i]
        return palette
    
    def clear(self):
        self.palette = []
    
palettes = PaletteHandler()
    
class Disk:
    def __init__(self, radius, color):
        self.radius = radius
        self.color = color
        self.type = "disk"

    def draw_onto(self, w, h, bitmap):
        # Precomputed values for the disk
        cx = w // 2
        cy = h // 2
        r = self.radius
        c = self.color
        qf = 40
        dx = max(1, r // qf)
        xs = [x for x in range(0, r+dx, dx) if x * x <= r * r]
        ys = [math.floor(math.sqrt(r * r - x * x)) for x in xs]
        for i in range(1, len(xs)):
            w = xs[i] - xs[i-1]
            h = ys[i-1]
            bitmaptools.fill_region(bitmap, math.floor(cx + xs[i-1]), math.floor(cy - h), math.floor(cx + xs[i]), math.floor(cy + h), c)
        for i in range(1, len(xs)):
            w = xs[i] - xs[i-1]
            h = ys[i-1]
            bitmaptools.fill_region(bitmap, math.floor(cx - xs[i]), math.floor(cy - h), math.floor(cx - xs[i-1]), math.floor(cy + h), c)

class Section:
    def __init__(self, index, color):
        self.index = index
        self.color = color
        self.type = "section"
    

    def draw_onto(self, w, h, bitmap):
        hw = w // 2
        hh = h // 2
        
        if self.index == 0:
            bitmaptools.fill_region(bitmap, hw, 0, w, hh, self.color)
        elif self.index == 1:
            bitmaptools.fill_region(bitmap, 0, 0, hh, hw, self.color)
        elif self.index == 2:
            bitmaptools.fill_region(bitmap, 0, hh, hw, h, self.color)
        elif self.index == 3:
            bitmaptools.fill_region(bitmap, 0, hh, w, h, self.color)

class TemplateFilter:
    def __init__(self, x, y, s, backgroundColor, components):
        self.x = x
        self.y = y
        self.s = s
        self.backgroundColor = backgroundColor
        self.components = components

    def to_bitmap(self):
        bitmap = displayio.Bitmap(self.s, self.s, len(palettes))
        bitmap.fill(self.backgroundColor)
        for i in range(len(self.components)):
            self.components[i].draw_onto(self.s, self.s, bitmap)
        return bitmap

class SerialStream:
    def __init__(self, serial):
        self.serial = serial
        self.next = None

    def peek(self):
        if self.next is None:
            if self.serial.in_waiting > 0:
                self.next = chr(self.serial.read(1)[0])
        return self.next

    def read(self):
        nxt = self.next
        if nxt is not None:
            result = nxt
            self.next = None
            return result
        if self.serial.in_waiting > 0:
            return chr(self.serial.read(1)[0])
        return None
    
    def read_bytes(self, n):
        return self.serial.read(n)

    def has_next(self):
        return self.peek() is not None

def parse_hex_digit(stream):
    char = stream.read()
    return int(char, 16)

def parse_hex_byte(stream):
    bs = stream.read() + stream.read()
    return int(bs, 16)

def parse_3_digit_hex_number(stream):
    bs = stream.read() + stream.read() + stream.read()
    return int(bs, 16)

def parse_color_ref(stream):
    return parse_hex_byte(stream)

def expect(stream, expected):
    token = stream.read()
    if token != expected:
        raise ValueError(f"Expected {expected} but got {token}")

def parse_palette(stream):
    expect(stream, "P")
    if stream.peek() == ">":
        palettes.clear()
        return
    r = parse_hex_byte(stream)
    g = parse_hex_byte(stream)
    b = parse_hex_byte(stream)
    color = b + g * 256 + r * 65536
    palettes.append(color)

def parse_clear(stream):
    expect(stream, "Z")
    animations.clear()
    while (len(main) > 0):
        main.pop()
    gc.collect()
    print("Free memory:", gc.mem_free())

def hex_digits_to_binary(data):
    result = ""
    for i in range(len(data)):
        value = int(data[i], 16)
        result += bin(value).zfill(4)
    return result

def binary_to_indices(binary, bits):
    indices = []
    for i in range(0, len(binary), bits):
        value = int(binary[i:i+bits], 2)
        indices.append(value)
    return indices

def add_bitmap(x, y, width, height, bits, stream):
    pixel_width = 16*width
    pixel_height = 16*height
    bitmap = displayio.Bitmap(pixel_width, pixel_height, 16 if bits <= 4 else 256)
    for i in range(0, width):
        for j in range(0, height):
            block = binascii.unhexlify(stream.read_bytes(512))
            bitmaptools.arrayblit(bitmap, block, i * 16, j * 16, (i+1) * 16, (j+1) * 16)
    tile_grid = displayio.TileGrid(bitmap, x=x-pixel_width//2, y=y-pixel_height//2, pixel_shader=palettes.make_palette())
    main.append(tile_grid)

def parse_bitmap(stream):
    expect(stream, "B")
    x = parse_3_digit_hex_number(stream)
    y = parse_3_digit_hex_number(stream)
    width = parse_hex_byte(stream)
    height = parse_hex_byte(stream)
    bits = parse_hex_digit(stream)
    add_bitmap(x, y, width, height, bits, stream)

def add_template(x, y, s, backgroundColor, components):
    template = TemplateFilter(x, y, s, backgroundColor, components)
    bitmap = template.to_bitmap()
    tile_grid = displayio.TileGrid(bitmap, x= x - s // 2, y = y - s // 2, pixel_shader=palettes.make_palette())
    main.append(tile_grid)

def parse_disk(stream):
    expect(stream, "D")
    radius = parse_3_digit_hex_number(stream)
    color = parse_color_ref(stream)
    return Disk(radius, color)

def parse_section(stream):
    expect(stream, "S")
    index = parse_hex_digit(stream)
    color = parse_color_ref(stream)
    return Section(index, color)


def parse_template(stream):
    expect(stream, "T")
    x = parse_3_digit_hex_number(stream)
    y = parse_3_digit_hex_number(stream)
    s = parse_3_digit_hex_number(stream)
    backgroundColor = parse_color_ref(stream)
    components = []
    while stream.peek() != ">":
        type = stream.peek()
        if type == "D":
            components.append(parse_disk(stream))
        elif type == "S":
            components.append(parse_section(stream))
        else:
            raise ValueError(f"Unknown template type: {type}")
    add_template(x, y, s, backgroundColor, components)


def parse_modify_palette(stream):
    expect(stream, "M")
    index = parse_hex_byte(stream)
    r = parse_hex_byte(stream)
    g = parse_hex_byte(stream)
    b = parse_hex_byte(stream)
    color = (r, g, b)
    if index < len(palettes):
        palettes.modify(index, color)
        new_palette = palettes.make_palette()
        for i in range(len(main)):
            main[i].pixel_shader = new_palette

def parse_bitmap_key_frame(stream):
    expect(stream, "B")
    index = parse_hex_byte(stream)
    x = parse_3_digit_hex_number(stream)
    y = parse_3_digit_hex_number(stream)
    visible = stream.read() == "V"
    return BitmapKeyFrame(index, x, y, visible)
    

def parse_palette_key_frame(stream):
    expect(stream, "P")
    index = parse_hex_byte(stream)
    r = parse_hex_byte(stream)
    g = parse_hex_byte(stream)
    b = parse_hex_byte(stream)
    return PaletteKeyFrame(index, r, g, b)

def parse_animation_frame(stream):
    expect(stream, "A")
    duration = parse_hex_byte(stream) * 16666666
    components = []
    while stream.peek() != ">":
        type = stream.peek()
        if type == "B":
            components.append(parse_bitmap_key_frame(stream))
        elif type == "P":
            components.append(parse_palette_key_frame(stream))
        else:
            raise ValueError(f"Unknown animation component: {type}")
    animations.append((duration, components))

def parse_command(stream):
    expect(stream, "<")
    command = stream.peek()
    if command == "P":
        parse_palette(stream)
    elif command == "M":
        parse_modify_palette(stream)
    elif command == "Z":
        parse_clear(stream)
    elif command == "B":
        parse_bitmap(stream)
    elif command == "T":
        parse_template(stream)
    elif command == "A":
        parse_animation_frame(stream)
    else:
        raise ValueError(f"Unknown command: {command}")
    expect(stream, ">")

def get_total_animation_length():
    total = 0
    for i in range(len(animations)):
        total += animations[i][0]
    return total

display.root_group = main

stream = SerialStream(serial)

animationStartTime = time.monotonic_ns()
animationElapsedTime = 0

while True:
    if stream.has_next():
        parse_command(stream)
    if len(animations) > 1:
        total_time = get_total_animation_length()
        if animationElapsedTime > total_time:
            animationStartTime = time.monotonic_ns()
            animationElapsedTime = 0
        currentT = animationElapsedTime
        for i in range(len(animations)):
            duration, components = animations[i]
            if currentT < duration:
                for j in range(len(components)):
                    component = components[j]
                    if component.type == "bitmapkf":
                        tile_grid = main[component.index]
                        tile_grid.x = component.x - tile_grid.bitmap.width // 2
                        tile_grid.y = component.y - tile_grid.bitmap.height // 2
                        tile_grid.hidden = not component.visible
                    elif component.type == "palettekf":
                        if component.index < len(palettes):
                            palettes.modify(component.index, component.b + component.g * 256 + component.r * 65536)
                            new_palette = palettes.make_palette()
                            for k in range(len(main)):
                                main[k].pixel_shader = new_palette
                break
            currentT -= duration
        animationElapsedTime = time.monotonic_ns() - animationStartTime
    display.refresh()
 # type: ignore