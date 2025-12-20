# 🧩 **Worldcoin Stats Dashboard｜デザイン仕様書（デザインのみ）**

※ これは **UIの見た目・文字・配色・余白・パーツ** に限定した仕様。
※ 機能仕様／UIモック／挙動は次回答以降で作成。

---

# 1. 🎨 **デザイン哲学（Design Philosophy）**

1. **白黒グレーのみを使用**
   → UI全体の色は “白・黒・グレー” に限定
   → 色は **データの可視化（グラフ・ヒートマップ・増減など）にのみ使用**

2. **「ただの白HTMLなのに美しい」を成立させる最小デザイン**
   → 装飾ゼロに見えるが、実際にはフォント・行間・余白が極めて精密に調整されている
   → Notion / Linear / Stripe Docs の思想を統合

3. **数字中心のプロダクト設計**
   → 数字・短文が美しく見える文字組み
   → Data visualization の前段階として “文字の美しさ” を基礎に据える

4. **超軽量・高速・高可読性**
   → Cloudflare Pages で高速表示
   → 装飾少なめで読み込み最小

---

# 2. 🅰 **フォント（Typography）**

## 2-1. ベースフォントセット

```css
font-family:
  "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont,
  "Segoe UI", "Roboto", "Noto Sans JP", "Hiragino Sans",
  sans-serif;
```

**理由**

* Inter：数字・短文・ダッシュボード向けの世界標準
* Noto Sans JP：日本語の視認性が最も安定
* OSネイティブフォントに自然にフォールバック

---

# 3. 🔢 **フォントサイズ設計（階層）**

| 用途          | サイズ     | Weight | 行間（LH）   |
| ----------- | ------- | ------ | -------- |
| H1（ページタイトル） | 28px    | 600    | 1.3      |
| H2（セクション）   | 22px    | 600    | 1.35     |
| H3（小見出し）    | 18px    | 600    | 1.4      |
| 本文          | 16px    | 400    | **1.65** |
| 補助説明        | 14px    | 400    | 1.6      |
| データ数値（強調）   | 24–32px | 600    | 1.1      |
| 小さな数値（表）    | 15px    | 400    | 1.4      |

---

# 4. 🅱 **数字（Numeric Typography）**

数字を美しく見せるための必須設定：

```css
font-feature-settings: "tnum" 1, "lnum" 1;
```

* **tnum**：等幅数字（桁揃え）
* **lnum**：現代的見やすい数字

ダッシュボードで最も重要。

---

# 5. 🪶 **字間（Letter-spacing）**

```css
body { letter-spacing: 0.01em; }
h1, h2, h3 { letter-spacing: -0.01em; }
```

* 見出しは気持ち詰める → 高級感
* 本文はほんの少し広げる → 読みやすさ向上

---

# 6. 📐 **余白（Spacing System）**

Notion・Linear 系のレイアウトに合わせる。

### セクション間

```
margin-top: 48px;
margin-bottom: 48px;
```

### ブロック（見出し・説明文）間

```
margin-bottom: 20px;
```

### カード間

```
gap: 24px;
```

### ページ左右余白

* PC：max-width 960px、中寄せ
* スマホ：左右 16px

---

# 7. ⚪ **色（Color System）※白黒基調**

## 7-1. ライトモード

```
背景：#ffffff
テキスト：#111111
サブテキスト：#555555
区切り線：rgba(0,0,0,0.08)
カード境界：rgba(0,0,0,0.06)
UIグレー：#f7f7f7, #e5e5e5
```

## 7-2. ダークモード

```
背景：#0f0f0f
サブ背景：#161616
テキスト：#e5e5e5
サブテキスト：#bbbbbb
区切り線：rgba(255,255,255,0.08)
カード境界：rgba(255,255,255,0.06)
```

## 7-3. 色が許される場所（分析のみ）

* グラフ
* スパイク表示
* ヒートマップ
* 増減（Green/Red）
* 世界地図の国別色
  → UIは白黒固定

---

# 8. ⬛ **UIパーツ仕様（最低限の装飾）**

## 8-1. ボタン

```
background: white;
border: 1px solid rgba(0,0,0,0.12);
padding: 8px 14px;
border-radius: 6px;
font-size: 14px;
```

**ホバー**

```
background: #f5f5f5;
```

**ダークモード**

```
background: #161616;
border: 1px solid rgba(255,255,255,0.15);
```

---

## 8-2. カード（統計値）

```
background: #fff;
border: 1px solid rgba(0,0,0,0.06);
padding: 20px;
border-radius: 10px;
```

ダークモード：

```
background: #161616;
border: 1px solid rgba(255,255,255,0.06);
```

影は **使用しない**。

---

## 8-3. テーブル（Hairline）

```
border-bottom: 0.5px solid rgba(0,0,0,0.08);
padding: 12px 0;
```

ダークモード：

```
border-bottom: 0.5px solid rgba(255,255,255,0.08);
```

---

## 8-4. アイコン（Lucide / Tabler）

* 線幅 1.5px
* 色：黒 or 白
* Fill なし
* 必要最小限のみ使用

---

# 9. 📱 **レスポンシブ**

## PC

* max-width: 960px
* 2〜3カラム
* 余白広め

## モバイル

* 1カラム
* 左右 16px
* 数字カードは横スワイプ可能にしても良い

---

# 10. 🧱 **レイアウト構造（Structure）**

1. Header（ロゴ＋Light/Dark切替）
2. メイントップ：主要4指標のカード
3. セクション：Orb、World ID、WLD、Worldchain
4. 最後に小さめの説明文（グレー）

配置そのものも極めてミニマル・直線的。

---

