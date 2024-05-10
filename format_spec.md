# Motivation

To send patterns to be displayed from the web-application to the LCD filter, we can design a text-based protocol to transmit palette and template / bitmap drawings to the device. Since most filter designs are achievable by combining simple shapes like square, rectangles and circles we can avoid sending entire bitmaps through the serial port, improving the responsiveness of the filter.

# Protocol

The data is sent as a series commands represented ASCII encoded text. The protocol is case-sensitive. Each command starts with the character '<' and ends with the character '>'. The first character after '<' determines the type of command. The rest of the command is determined by the command type.

## Palette

The palette is a list of colors that can be used in the pattern created by drawing commands. Each color is represented by a 6-character hexadecimal string. The palette is stored in the device and can be referenced by an integer identifier. The palette can store up to 256 colors.

### Adding a palette entry

The command to add a palette entry is of the form:

```text
<PRRGGBB>
```

Where `RR`, `GG` and `BB` are the red, green and blue components of the color in hexadecimal format.

For example, to add 5 entries to the palette, with increasing integer identifier, the following commands can be sent:

```text
<P000000><PFF0000><P00FF00><P0000FF><PFFFFFF>
```

If the palette was previously empty, the first entry will be assigned the identifier `0`. Subsequent entries will be assigned the next available identifier up to `FF`. If the palette is full, the command will be ignored.

### Updating a palette entry

The command to modify a palette entry is of the form:

```text
<MIIRRGGBB>
```

Where `II` is the integer identifier of the palette entry to update and `RR`, `GG` and `BB` are the red, green and blue components of the color in hexadecimal format.

### Clearing the palette

The command to clear the palette is:

```text
<P>
```

## Drawing

The drawing commands are used to create patterns on the filter. The drawing commands are bitmap based or based on simple geometric templates.

### Clearing the screen

The command to clear (zero) the screen is:

```text
<Z>
```

Note that this command does not clear the palette.

### Bitmap-based drawing

The command to draw a bitmap is of the form:

```text
<BXXXYYYWWWHHHN...>
```

Where `XXX` and `YYY` are the x and y coordinates of the top-left corner of the bitmap in pixels, `WW` and `HH` are the width and height of the bitmap in blocks of 16x16 pixels, expressed as hexadeximal numbers of 2 hexadecimal digits each, N is the number of bits that each palette entry requires (maximum 8). The bitmap is segmented into 16x16 pixels blocks. The data for each block is stored in row-major order and encoded in hexadecimal, where each pixel is a pair of hexadecimal digits. The number of hexadecimal digits must be a multiple of 512 (16x16x2).

For example, to draw a 3x3 bitmap with 3 bits per palette entry, with top left corner at X=120 and Y=120 pixels and uniform color of index 1 (binary "001" using 3 bits), the following command can be sent:

### Template-based drawing

Most basic filter designes can be expressed using this command. The command to draw a template is of the form:

```text
<TXXXYYYSSSC0...disks_and_sections...>
```

Breaking down the beginning of the command:

- 'T' identifies the command as a template drawing command.
- `XXX` and `YYY` are the x and y coordinates of the center of the template in pixels.
- `SSS` is the size of the side of the template in pixels, expressed as hexadeximal numbers of 3 hexadecimal digits each.
- `C0` is the palette index of the background color of the filter (command could end here).

The rest of the command is an optional sequence of circles and sector.

#### Disks

A disks is defined by the following sequence of characters:

```text
DRRRCC
```

Where `CC` is the palette index of the color of the disk and `RRR` is the radius of the disk in pixels.

#### Circular sectors

A circular sector is defined by the following sequence of characters:

```text
SNCC
```

Where `N` is the sector number, hexadecimal from 0 to F, and `CC` is the palette index of the color of the sector. The sector is drawn as a pie slice with the center at the center of the template, the radius of the sector equal to the radius of the template and the angle of the sector equal to `N` times 22.5 degrees. The first sector starts at the x-axis and the sector are drawn in counter-clockwise order.

#### Animation

To animate the filter, the animation command can define frames that set the position and visibility of each drawn bitmap / template or the color of each palette entry. The animation command is of the form:

```text
<ADD...BIIXXXYYYV...PIIRRGGBB...>
```

Where `A` identifies the command as an animation command, `DD` is the duration of the frame in animation ticks, `BIIVXXXYYY` (zero or more) modifies the bitmap / template with identifier `II` settingd visibility to `V` (`V` for visible,  `H` for hidden) and its position to `XXX`, `YYY`. `PIIRRGGBB`(zero or more) modifies the palette entry with identifier `II` setting its color to `RR`, `GG` and `BB`.