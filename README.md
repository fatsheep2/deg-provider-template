# DEG Provider Template

This repository stores runtime provider templates for `double-entry-generator`.

Each provider is organized by import ref. `provider/latest/` is used by `import provider`; dated pins such as `provider/2026-04-28/` are used by `import provider@2026-04-28`. A pin is a frozen bill format boundary, not a file-extension-specific provider id.

## Layout

```text
registry.yaml
wechat/
  latest/
    template.yaml
    rules.yaml
    bill.xlsx
    expected.beancount
  2026-04-28/
    template.yaml
    rules.yaml
    bill.xlsx
    expected.beancount
alipay/
  latest/
    template.yaml
    rules.yaml
    bill.csv
    expected.beancount
  2026-05-23/
    template.yaml
    rules.yaml
    bill.csv
    expected.beancount
```

`template.yaml` describes how to read the bill file. `rules.yaml` is the starter personal-rule skeleton for that exact pin. `bill.*` and `expected.beancount` are the regression example for the same pin.

## Usage

```bash
deg template list
deg config init wechat --output ./wechat-rules.yaml
deg import wechat bill.xlsx --rules ./wechat-rules.yaml
deg import wechat@2026-04-28 bill.xlsx --rules ./wechat-rules.yaml
```

`wechat` reads the online registry directly. Local paths and HTTP(S) URLs are used only for the current import and are not cached by DEG.

## Template format (v3)

A template says how to read a bill and which Beancount fields it fills. It never names an account.

```yaml
reader:   { format: xlsx }                                  # csv | xlsx | xls | json | xml | text
shape:    [ { locateHeader: { anchor: [交易时间, 金额(元)] } } ]  # header by anchor, drop/merge/split rows
template:
  slots:  { date: <交易时间>, payee: <交易对方>, narration: <商品>, amount: <金额(元)>.number, metadata: { … } }
  direction: { column: <收/支>, outflow: [支出], inflow: [收入] }
  vars:   { security: SZ<证券代码>.format("%06.0f") }       # never accounts
  legs:   [ { when: <操作> == "买", legs: [ { role: cash, amount: "-<成交金额>" }, … ] } ]
```

`rules.yaml` is the user's side: `accounts:` binds roles to the user's accounts once — `self` (the card or wallet the statement belongs to), `other` (the counterparty, which flips side on refunds), and `cash`/`position`/`fee`/`pnl`/… for brokers — and `personalRules:` override single transactions, usually with one `other:` per merchant or category. `output:` sets the default payee/narration and which metadata to keep.

Statement-level values above the table (account number, card alias, statement month) are read with `shape: - capture:` and used as `<file.x>`; `shape: - failIf:` stops the import when a row looks unfamiliar, and `template.timezone` pins wall-clock dates. See the engine's `docs/docs/providers/template.md` for the full syntax and the criteria a new feature must meet before it enters the syntax. See `htsec/latest` (multi-leg) and `wechat/latest` (two-leg) for complete examples. Older `templateRules` templates still import.
