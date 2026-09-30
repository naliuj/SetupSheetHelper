# Spreadsheet gear import — test files

Fake gear lists for trying Studio setup → "Import from a spreadsheet…". Each one exercises a
different way real inventory sheets come out. What each should do:

| File | What it tests | Expected result |
|---|---|---|
| `01-clean-excel-utf8.csv` | Mac Excel "CSV UTF-8": invisible BOM, Windows line endings | All four columns guessed correctly; 8 mics |
| `02-semicolon-european.csv` | Semicolons instead of commas; headers "Brand", "Mic Model", "Qty", "Type" | Semicolons detected; "Type" guessed as **Category** (its values are Condenser/Ribbon, not mic/outboard) and flagged to check; 5 mics |
| `03-windows-1252-accents.csv` | Windows Excel's older text encoding | RØDE, Brüel & Kjær and the "–" dash come through intact, not as `Ã˜` junk |
| `04-quoted-with-extra-columns.csv` | Commas and a line break inside quoted cells, `""` quotes, extra Serial #/Notes/Location columns | Serial #, Notes and Location set to "Don't import"; `414 "B-ULS"` keeps its quotes; 4 mics |
| `05-no-header-row.csv` | No header row at all | "First row is column names" starts unticked; columns show as Column 1–3. Name and Quantity are guessed from the contents (flagged to check); set Column 2 to Manufacturer by hand; 5 mics |
| `06-mixed-types.csv` | Mics, outboard and preamps in one sheet, with a Type column | "From a Type column" chosen; Microphone → mic, Processor/Compressor → outboard; preamp counts are channels (Neve 1073 → 8 channels) |
| `07-messy-names-and-quantities.csv` | Manufacturer inside the name, every quantity style, duplicates, AT-4050 vs AT4050, a blank name, "two", a TOTAL row | Names split (Neumann + U 87 Ai); 2x/x3/2 pcs read as numbers; blank and "—" read as 1 with a note; the two SM57 rows merge to ×4; both AT4050 spellings merge to ×2; the blank-name row and TOTAL skipped; "two" flagged as unreadable and counted as 1 |
| `08-pasted-from-spreadsheet.txt` | What pasting cells from Excel / Numbers / Google Sheets gives you (tab-separated) | Open it, copy everything, paste into the paste box; 4 mics |
| `09-title-row-above-headers.csv` | A title, a date line and a blank row above the real headers | The title lines are skipped and row 4 is used as the headers; 3 mics |

To test merging into existing gear, import `01` into a studio, save, then import `07`: its SM57s
should add to the existing ×6 rather than creating a second SM57 row.
