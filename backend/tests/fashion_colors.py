"""Labeled fashion colors for the color-naming tests.

Each entry is (common name, hex, expected app color). Expected names use the
app's fixed 14-color vocabulary. Colors whose app name is genuinely
debatable (coral, rust, mauve, taupe, aqua) are left out on purpose.
"""

FASHION_COLORS = [
    # Black
    ("black", "#000000", "Black"), ("jet", "#343434", "Black"), ("onyx", "#353839", "Black"),
    ("off-black", "#1a1a1a", "Black"), ("washed black", "#2b2b2b", "Black"),
    # White
    ("white", "#ffffff", "White"), ("snow", "#fffafa", "White"), ("off-white", "#faf9f6", "White"),
    ("ivory", "#fffff0", "White"), ("optic white", "#f4f5f0", "White"),
    # Gray
    ("gray", "#808080", "Gray"), ("silver", "#c0c0c0", "Gray"), ("charcoal", "#36454f", "Gray"),
    ("slate", "#708090", "Gray"), ("dim gray", "#696969", "Gray"), ("light gray", "#d3d3d3", "Gray"),
    ("heather gray", "#9fa2a5", "Gray"), ("graphite", "#474a51", "Gray"),
    # Navy
    ("navy", "#000080", "Navy"), ("midnight blue", "#191970", "Navy"), ("dark navy", "#1c2841", "Navy"),
    ("oxford blue", "#002147", "Navy"), ("deep navy", "#1f2a44", "Navy"),
    # Blue
    ("royal blue", "#4169e1", "Blue"), ("cobalt", "#0047ab", "Blue"), ("sky blue", "#87ceeb", "Blue"),
    ("denim", "#1560bd", "Blue"), ("light denim", "#6f8faf", "Blue"), ("cornflower", "#6495ed", "Blue"),
    ("steel blue", "#4682b4", "Blue"), ("baby blue", "#89cff0", "Blue"), ("chambray", "#7b9cc2", "Blue"),
    # Red
    ("red", "#ff0000", "Red"), ("crimson", "#dc143c", "Red"), ("burgundy", "#800020", "Red"),
    ("maroon", "#800000", "Red"), ("wine", "#722f37", "Red"), ("cherry", "#de3163", "Red"),
    ("scarlet", "#ff2400", "Red"), ("brick", "#a83232", "Red"),
    # Green
    ("forest green", "#228b22", "Green"), ("olive", "#708238", "Green"), ("olive drab", "#6b8e23", "Green"),
    ("army green", "#4b5320", "Green"), ("sage", "#9caf88", "Green"), ("emerald", "#50c878", "Green"),
    ("kelly green", "#4cbb17", "Green"), ("hunter green", "#355e3b", "Green"), ("mint", "#98ff98", "Green"),
    ("khaki green", "#8a865d", "Green"),
    # Yellow
    ("yellow", "#ffff00", "Yellow"), ("mustard", "#e1ad01", "Yellow"), ("lemon", "#fff44f", "Yellow"),
    ("gold", "#ffd700", "Yellow"), ("canary", "#ffef00", "Yellow"), ("butter", "#f9e79f", "Yellow"),
    # Orange
    ("orange", "#ffa500", "Orange"), ("burnt orange", "#cc5500", "Orange"), ("tangerine", "#f28500", "Orange"),
    ("pumpkin", "#ff7518", "Orange"), ("safety orange", "#ff6700", "Orange"),
    # Purple
    ("purple", "#800080", "Purple"), ("lavender", "#b57edc", "Purple"), ("plum", "#8e4585", "Purple"),
    ("violet", "#8f00ff", "Purple"), ("eggplant", "#614051", "Purple"), ("lilac", "#c8a2c8", "Purple"),
    ("grape", "#6f2da8", "Purple"),
    # Pink
    ("pink", "#ffc0cb", "Pink"), ("hot pink", "#ff69b4", "Pink"), ("blush", "#fe828c", "Pink"),
    ("fuchsia", "#ff00ff", "Pink"), ("baby pink", "#f4c2c2", "Pink"), ("magenta", "#ff0090", "Pink"),
    ("dusty pink", "#d8a1a4", "Pink"), ("bubblegum", "#ffc1cc", "Pink"),
    # Brown
    ("brown", "#964b00", "Brown"), ("chocolate", "#7b3f00", "Brown"), ("camel", "#c19a6b", "Brown"),
    ("coffee", "#6f4e37", "Brown"), ("cognac", "#9a463d", "Brown"), ("walnut", "#773f1a", "Brown"),
    ("espresso", "#4e312d", "Brown"), ("tan", "#d2b48c", "Brown"), ("saddle", "#8b4513", "Brown"),
    # Beige
    ("beige", "#f5f5dc", "Beige"), ("khaki", "#c3b091", "Beige"), ("sand", "#c2b280", "Beige"),
    ("cream", "#fffdd0", "Beige"), ("oatmeal", "#e3d9c6", "Beige"), ("ecru", "#cdb891", "Beige"),
    ("bone", "#e3dac9", "Beige"),
    # Teal
    ("teal", "#008080", "Teal"), ("dark cyan", "#008b8b", "Teal"), ("turquoise", "#40e0d0", "Teal"),
    ("petrol", "#005f6a", "Teal"), ("deep teal", "#014d4e", "Teal"),
]


def hex_to_rgb(h: str):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]
