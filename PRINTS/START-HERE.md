# START HERE — Ender 3 V3 SE prints

Printer arrives tomorrow. This folder is the pile.

**On your machine, this lives on branch `cursor/radxa-zero-3w-case-fe04`, not `main`.** Sync with:

```bash
cd /path/to/Atom-Code
git fetch origin
git checkout cursor/radxa-zero-3w-case-fe04
git pull origin cursor/radxa-zero-3w-case-fe04
```

Then open `PRINTS/START-HERE.md`.

The first case in `cad/radxa-zero-3w-case/` is a measured tray: rounded box, holes for ports, screw lid. Useful, not a design exercise.

**Hive** (this folder) is the OpenSCAD design: a hex lattice generated with a loop, cantilever snap barbs, visors over the cables, recessed `ZERO 3W` text, and a 12° desk cradle.

## Tomorrow, in this order

1. **Fit coupon first** (~15 min, little filament)  
   `PRINTS/stl/zero3w_coupon.stl`  
   Drop the real ZERO 3W in. Try **micro HDMI** (left), USB 3.0 Host, and USB 2.0 OTG (**power**).  
   The left hole is sized for the **cable’s plastic housing**, not just the 6.5 mm metal. Typical Type-D overmolds are ~11 mm wide, so that opening will look close to the USB-C holes. That is required for the plug to seat.  
   If the plugs line up, print Hive. If they don’t, stop — don’t print the full case.

2. **Hive case**  
   `PRINTS/stl/zero3w_hive-base.stl`  
   `PRINTS/stl/zero3w_hive-lid.stl`  
   Snap the lid on — **one clip on each short end**. To open, press the barb in through the window on the outside of each end (fingernail or small screwdriver), then lift. Optional 4× **M2.5 flat-head (countersunk)** screws if you want it locked down. Pan-head screws will sit proud.

3. **Desk cradle** (optional)  
   `PRINTS/stl/zero3w_hive-cradle.stl`  
   12° wedge. 3.6 mm at the port end, ~12.5 mm at the GPIO end. Case drops in, cables face downhill.

One-plate file if you want everything at once: `PRINTS/stl/zero3w_hive-print.stl`.

## Slice (Ender 3 V3 SE, 0.4 mm nozzle)

| | Coupon | Hive base / lid | Cradle |
|---|---|---|---|
| Material | PLA is fine | PETG preferred (snaps + heat) | PLA or PETG |
| Layer | 0.20 mm | 0.20 mm | 0.20 mm |
| Walls | 3 | 3 | 3 |
| Infill | 15% | 20% gyroid | 15% |
| Supports | None | None | None |
| Orientation | as exported | as exported | as exported (ramp on the bed) |

Do not print until the slicer layer view looks right.

## Source (change numbers here)

| File | What it is |
|---|---|
| `zero3w_board.scad` | Official v1.11 DXF coordinates. Shared by coupon + Hive. |
| `zero3w_coupon.scad` | Open tray. First print. |
| `zero3w_hive.scad` | Lattice lid, snaps, visors, cradle. Set `part` to `preview` / `base` / `lid` / `cradle` / `print`. |

```bash
cd PRINTS
openscad -D 'part="lid"' -o stl/zero3w_hive-lid.stl zero3w_hive.scad
```

## Previews

![Hive assembled](preview/hive-assembled.png)

![Hive lid — lattice, snaps, ZERO 3W](preview/hive-lid.png)

![Fit coupon](preview/coupon.png)

## The other case

Measured screw-together tray (if Hive’s snaps annoy you):  
[`cad/radxa-zero-3w-case/`](../cad/radxa-zero-3w-case/)
