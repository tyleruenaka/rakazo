#!/bin/sh
# Builds the title bar buttons: red, yellow and green circles, gray when the window is unfocused.
# Circles are drawn on the title bar color so their edges stay smooth without an alpha mask.
set -eu
out="$1"
size=22
mkdir -p "$out"
button() { # name background fill border
  convert -size $((size * 8))x$((size * 8)) xc:"$2" -fill "$3" -stroke "$4" -strokewidth 5 \
    -draw "circle $((size * 4)),$((size * 4)) $((size * 4)),$((size * 4 - 46))" \
    -resize ${size}x${size} "$out/$1.png"
}
focused='#e8e8e8'
unfocused='#f6f6f6'
button close "$focused" '#ff5f57' '#e0443e'
button minimize "$focused" '#febc2e' '#dea123'
button maximize "$focused" '#28c840' '#1aab29'
button close-pressed "$focused" '#c9433d' '#a8332d'
button minimize-pressed "$focused" '#c9952a' '#a87b1c'
button maximize-pressed "$focused" '#209e33' '#178523'
button unfocused "$unfocused" '#dcdcdc' '#cdcdcd'
