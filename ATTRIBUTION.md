# Data and third-party notices

The MIT license in `LICENSE` covers the source code only. Data and
dependencies keep their own terms.

## PLATEAU 3D city models (data)

`public/data/ginza.city.json` is processed from:

> 「3D都市モデル（Project PLATEAU）東京都中央区（2025年度）」（国土交通省）（https://www.mlit.go.jp/plateau/open-data/）を加工して作成

- Dataset: building model (bldg), LOD2 without texture, 3D Tiles, distributed
  through the PLATEAU data catalog.
- Terms: PLATEAU site policy, https://www.mlit.go.jp/plateau/site-policy/
  (Public Data License 1.0; compatible with CC BY 4.0, ODC BY and ODbL).
  Commercial use is allowed. Copyright in PLATEAU open data belongs to the
  local government that made it (here, Chuo City, Tokyo).

Processing: buildings inside a 400 m x 300 m rectangle around
35.6717 N, 139.7640 E were cut out, converted to local metres, placed on a
flat ground and quantised to 0.1 m. Only id, height and usage attributes are
kept.

If you publish a city made with this tool, credit the source and say you
processed it, for example:

> 「3D都市モデル（Project PLATEAU）〇〇市（20XX年度）」（国土交通省）（https://www.mlit.go.jp/plateau/open-data/）を加工して作成
> Processed from MLIT Project PLATEAU 3D city model, 〇〇 (FY20XX), https://www.mlit.go.jp/plateau/open-data/

Do not present processed data as if MLIT or the local government made it.

### Survey Act (測量法)

PLATEAU building models are partly public survey results (公共測量成果).
Viewing, converting and redistributing them as open data needs no
procedure (PLATEAU FAQ: 「3D都市モデルのデータを利用するのに手続きは必要
ですか。」→「手続き不要です。」). If you use the data **to carry out a
survey** (測量), Article 44 of the Survey Act requires prior approval from
the body that made the survey results, and Article 44(4) requires stating
that public survey results were used when you publish. See
https://www.mlit.go.jp/plateau/libraries/handbooks/ (3D都市モデル整備のための
測量マニュアル). This viewer is not a survey tool and its output is not
survey-grade.

## Dependencies

| Package | License | Used for |
| --- | --- | --- |
| three | MIT | rendering (shipped in the bundle) |
| vite | MIT | dev server and build (not shipped) |
| draco3d | Apache-2.0 | decoding Draco meshes in `tools/` (not shipped) |
