# Programmable microscope filter for transparent LCDs

Many LCDs are transparent when not powered. This project is a programmable filter that can be placed under the condenser to act as a dynamic filter for a microscope. The filter is controlled by a Raspberry Pi Pico microcontroller. The code for the Raspberry Pi Pico depends on Adafruit's CircuitPython firmware and the specific display driver used (in this case, the GC9A01 circular LCD).

## The GC9A01 display

The GC9A01 is a 240x240 pixel circular display that can be easily separated from the backlit panel. The display is attached to the panel with a weak glue, so careful prying can separate the two parts.

## How to use

Install the CircuitPython firmware on the Raspberry Pi Pico (see CircuitPython documentation, it's as simple as downloading the firmware and drag and drop it). Copy the code from the "rpi" folder into the CircuitPython device, which will appear as a mass storage device when the Pico is connected to a computer and will contain a file called "code.py". Download the python driver for the GC9A01 display from https://github.com/tylercrumpton/CircuitPython_GC9A01 and add it to the same folder as the "code.py" file.

Finally, open the programmable_filter.html file in a web browser. The file contains a simple interface to send commands to the filter using the Web Serial API. The interface has some pre-made parametric filter designs that can be modified or new designs can be created. The current list of filters is stored in the browser's local storage and can also be saved to a file.