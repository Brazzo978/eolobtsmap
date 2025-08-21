<img width="963" height="21" alt="image" src="https://github.com/user-attachments/assets/67da15cf-99e5-4b70-8642-310462458783" />Guida Sweep per download da https://www.arpa.fvg.it/

Esegui lo sweep con griglia fitta per raccogliere tutti i popup della mappa:

python wms_gfi_sweep.py "https://lizmap.arpa.fvg.it/test/index.php/lizmap/service/?repository=nir&project=campi_elettromagnetici_pubblico&service=WMS" ^
  "v_antenne_telefonia_altro" out_html ^
  --bbox "1274866.3671534362,5613612.623354041,1581531.724590875,5984790.832655189" ^
  --width 1003 --height 1214 ^
  --gridx 200 --gridy 300 ^
  --cookie "PHPSESSID=xxxxxx; lizmap_session=yyyyy"

inserendo il PHPSESSID  e il lizmap_session se disponibile.


dopo esegui python dedup_html_to_csv.py out_html out/dedup.csv


Questo genera un file dedup.csv con tutti i dati raccolti in un unico file.



Guida download e import da https://gaia.arpa.veneto.it/maps/285

WIP


Guida download e import da https://sira.arpat.toscana.it/sira/misure_rf/portale.php#map-wrapper

WIP
