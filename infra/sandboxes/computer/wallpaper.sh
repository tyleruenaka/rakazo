#!/bin/sh
# Builds the desktop wallpaper: a blurred dusk gradient with subtle film grain.
# Grain does not compress, so it is kept light to keep screenshots small.
# A fixed seed keeps every image build identical.
set -eu
convert -size 6x4 xc:'#2b3a55' \
  -fill '#3f5a7a' -draw 'point 0,0' -draw 'point 1,0' -draw 'point 2,0' -draw 'point 5,0' \
  -fill '#7d8fb0' -draw 'point 3,0' -draw 'point 4,0' -draw 'point 4,1' \
  -fill '#e9a77c' -draw 'point 0,2' -draw 'point 1,2' -draw 'point 0,3' \
  -fill '#f4c9a4' -draw 'point 1,1' -draw 'point 2,2' \
  -fill '#c9b6c8' -draw 'point 3,2' -draw 'point 5,1' \
  -fill '#ee8a52' -draw 'point 1,3' \
  -fill '#41506e' -draw 'point 4,3' -draw 'point 5,3' -draw 'point 5,2' \
  -fill '#9aa6c4' -draw 'point 2,3' -draw 'point 3,3' \
  -filter Gaussian -resize 1280x880! -blur 0x60 \
  -wave 18x900 -gravity center -crop 1280x800+0+0 +repage \
  \( -size 1280x800 xc:gray50 -seed 42 -attenuate 0.12 +noise Gaussian -colorspace Gray \) \
  -compose Overlay -composite \
  -quality 86 -sampling-factor 4:4:4 "$1"
