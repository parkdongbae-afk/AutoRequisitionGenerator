/* GENERATED FILE — 자동 생성됨. 손으로 수정하지 마세요.
 * 원본: app/src/main/lib/rules/*.json 의 장바구니 캡처 규칙
 * 재생성: app/ 폴더에서 `node analysis/make-autoselect-rules.js`
 * 생성 시각: 2026-09-27T08:29:24.414Z
 */
(function (root) {
  'use strict';
  var MALLS = [
  {
    "id": "aladin",
    "name": "알라딘",
    "domains": [
      "aladin.co.kr"
    ],
    "matchPatterns": [
      "*://*.aladin.co.kr/*"
    ],
    "filterDomains": [
      "aladin.co.kr"
    ],
    "rowSelector": "tr[id^=CartTr_]",
    "rowBase": "tr[id^=CartTr_]",
    "checkbox": {
      "sel": "input.ShopCode_Basket_Check",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "span.basket_tit"
      },
      "qty": {
        "sel": "input.input1",
        "attr": "value"
      },
      "price": {
        "sel": "span.p1",
        "regex": "([\\d,]+)"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input.ShopCode_Basket_Check"
    },
    "priceIs": null,
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "none"
    }
  },
  {
    "id": "alphamall-cart",
    "name": "알파몰 장바구니",
    "domains": [
      "alpha.co.kr"
    ],
    "matchPatterns": [
      "*://*.alpha.co.kr/order/cart*"
    ],
    "filterDomains": [
      "alpha.co.kr"
    ],
    "rowSelector": "table.list-product-a tbody tr:has(input.chk-row)",
    "rowBase": "table.list-product-a tbody tr",
    "checkbox": {
      "sel": "input.chk-row",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "p.name"
      },
      "qty": {
        "sel": "input[name=CP_CNTs]",
        "attr": "value"
      },
      "price": {
        "sel": "p.price-after strong",
        "regex": "([\\d,]+)원"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input.chk-row"
    },
    "priceIs": null,
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "selector",
      "sel": "td div.labels p strong",
      "regex": "([\\d,]+)원"
    }
  },
  {
    "id": "auction-cart",
    "name": "옥션 장바구니",
    "domains": [
      "cart.auction.co.kr"
    ],
    "matchPatterns": [
      "*://*.cart.auction.co.kr/*"
    ],
    "filterDomains": [
      "cart.auction.co.kr",
      "auction.co.kr"
    ],
    "rowSelector": "li.list-item__item",
    "rowBase": "li.list-item__item",
    "checkbox": {
      "sel": "input.form__checkbox",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "span.text__item-name"
      },
      "qty": {
        "sel": "input.form__quantity",
        "attr": "value"
      },
      "price": {
        "sel": "div.box__item-price strong.text__value",
        "regex": "([\\d,]+)"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input.form__checkbox"
    },
    "priceIs": "lineTotal",
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "selector",
      "sel": "div.box__group-seller-summary",
      "regex": "배송비\\s*([\\d,]+)원"
    }
  },
  {
    "id": "coupang",
    "name": "쿠팡",
    "domains": [
      "coupang.com"
    ],
    "matchPatterns": [
      "*://*.coupang.com/*"
    ],
    "filterDomains": [
      "coupang.com"
    ],
    "rowSelector": "div[id^=item_][data-selected=true]",
    "rowBase": "div[id^=item_]",
    "checkbox": {
      "sel": "input[type=checkbox]",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": {
      "attr": "data-selected",
      "value": "true"
    },
    "fields": {
      "name": {
        "sel": "div#name span.twc-break-all"
      },
      "qty": {
        "sel": "input.cart-quantity-input",
        "attr": "value",
        "regex": "(\\d+)"
      },
      "price": {
        "sel": "div[data-component-id=price-area] span.twc-text-\\[20px\\]\\/\\[27px\\]"
      },
      "option": {
        "sel": "div#name span.twc-line-clamp-2"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input[type=checkbox]"
    },
    "priceIs": "lineTotal",
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "selector",
      "sel": "span[data-component-id=vendor-delivery-charge]",
      "regex": "배송비\\s*([\\d,]+)원"
    }
  },
  {
    "id": "daisomall",
    "name": "다이소몰",
    "domains": [
      "daisomall.co.kr"
    ],
    "matchPatterns": [
      "*://*.daisomall.co.kr/*"
    ],
    "filterDomains": [
      "daisomall.co.kr"
    ],
    "rowSelector": "div.goods-unit",
    "rowBase": "div.goods-unit",
    "checkbox": {
      "sel": "input.el-checkbox__original",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "a.ellipsis1"
      },
      "price": {
        "sel": "div.goods-inner.total span.value",
        "regex": "([\\d,]+)"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input.el-checkbox__original",
      "legacySel": "label.el-checkbox.is-checked"
    },
    "priceIs": "lineTotal",
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": "div.goods-inner.price span.value",
    "qtyInputSel": "div.goods-inner.count input.el-input__inner",
    "shipping": {
      "mode": "selector",
      "sel": "li:contains('배송비')",
      "regex": "배송비:\\s*([\\d,]+)원",
      "freeOver": 30000
    }
  },
  {
    "id": "dreamdepot",
    "name": "드림디포",
    "domains": [
      "dreamdepot.co.kr"
    ],
    "matchPatterns": [
      "*://*.dreamdepot.co.kr/*"
    ],
    "filterDomains": [
      "dreamdepot.co.kr"
    ],
    "rowSelector": "tr:has(input.pm_number)",
    "rowBase": "tr",
    "checkbox": {
      "sel": "input[name='ps_cartuid[]']",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "p.goods_list_name"
      },
      "qty": {
        "sel": "input.pm_number",
        "attr": "value"
      },
      "price": {
        "sel": "p.goods_list_sale_price",
        "regex": "([\\d,]+)"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input[name='ps_cartuid[]']"
    },
    "priceIs": null,
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "selector",
      "sel": "span:contains('기본배송비')",
      "regex": "([\\d,]+)"
    }
  },
  {
    "id": "gmarket-cart",
    "name": "G마켓 장바구니",
    "domains": [
      "cart.gmarket.co.kr"
    ],
    "matchPatterns": [
      "*://*.cart.gmarket.co.kr/*"
    ],
    "filterDomains": [
      "cart.gmarket.co.kr",
      "gmarket.co.kr"
    ],
    "rowSelector": "div.item",
    "rowBase": "div.item",
    "checkbox": {
      "sel": "input.input__checkbox",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "span.item_name"
      },
      "qty": {
        "sel": "input.item_qty_count",
        "attr": "value"
      },
      "price": {
        "sel": "div.item_price strong.text__value",
        "regex": "([\\d,]+)",
        "match": "last"
      },
      "option": {
        "sel": ".option_value",
        "regex": "^\\s*(.*?)(?:\\s*\\([+-][^()]*원\\))?\\s*$"
      }
    },
    "units": {
      "sel": "dl.unit--item"
    },
    "checkedOnly": {
      "sel": "input.input__checkbox"
    },
    "priceIs": "lineTotal",
    "specFromOption": true,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "selector",
      "sel": "div.shipping--info div.delivery strong.text__value",
      "regex": "([\\d,]+)",
      "checkedScope": true,
      "perFee": true
    }
  },
  {
    "id": "icecream-cart",
    "name": "아이스크림몰 장바구니",
    "domains": [
      "i-screammall.co.kr",
      "screammall.co.kr"
    ],
    "matchPatterns": [
      "*://*.i-screammall.co.kr/order/cart*",
      "*://*.screammall.co.kr/order/cart*"
    ],
    "filterDomains": [
      "i-screammall.co.kr",
      "screammall.co.kr"
    ],
    "rowSelector": "div.flex.items-start:has(input[value=option-one])",
    "rowBase": "div.flex.items-start",
    "checkbox": {
      "sel": "input[value=option-one]",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "p.body3"
      },
      "qty": {
        "sel": "div.label1 span",
        "regex": "(\\d+)개"
      },
      "price": {
        "sel": "p.body2",
        "regex": "([\\d,]+)"
      },
      "option": {
        "sel": "div.label1 span"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input[value=option-one]"
    },
    "priceIs": "lineTotal",
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "selector",
      "sel": "span.text-gray3",
      "regex": "배송비\\s*([\\d,]+)원"
    }
  },
  {
    "id": "kyobo-cart",
    "name": "교보문고 장바구니",
    "domains": [
      "order.kyobobook.co.kr"
    ],
    "matchPatterns": [
      "*://*.order.kyobobook.co.kr/cart*"
    ],
    "filterDomains": [
      "order.kyobobook.co.kr",
      "kyobobook.co.kr"
    ],
    "rowSelector": "tr:has(input[name=chkList])",
    "rowBase": "tr",
    "checkbox": {
      "sel": "input[name=chkList]",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "span.prod_name"
      },
      "qty": {
        "sel": "input.form_spinner",
        "attr": "value"
      },
      "price": {
        "sel": ".prod_price span.price .val",
        "regex": "([\\d,]+)"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input[name=chkList]"
    },
    "priceIs": null,
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "none"
    }
  },
  {
    "id": "naver-cart",
    "name": "네이버 장바구니",
    "domains": [
      "shopping.naver.com"
    ],
    "matchPatterns": [
      "*://*.shopping.naver.com/cart*"
    ],
    "filterDomains": [
      "shopping.naver.com",
      "naver.com"
    ],
    "rowSelector": "div[class^=product--]:has(button[role=checkbox][aria-checked=true])",
    "rowBase": "div[class^=product--]",
    "checkbox": {
      "sel": "button[role=checkbox]",
      "stateMode": "aria-checked"
    },
    "productKey": {
      "sel": "[data-shp-contents-type=chnl_prod_no]",
      "attr": "data-shp-contents-id"
    },
    "selectedState": null,
    "zoomBeforeRun": true,
    "fields": {
      "name": {
        "sel": "[class*=title--]",
        "match": "last",
        "regex": "^(?:네이버플러스멤버십)?(.+)$"
      },
      "qty": {
        "sel": "input[class^=number--]",
        "attr": "value"
      },
      "price": {
        "sel": "em[class^=price--]",
        "regex": "([\\d,]+)원"
      },
      "option": {
        "sel": "[class^=option--]",
        "regex": "^\\s*(?:추가상품\\s*:\\s*)?(.*)$"
      }
    },
    "units": {
      "sel": "div[class^=product_item--]"
    },
    "checkedOnly": null,
    "priceIs": "lineTotal",
    "specFromOption": false,
    "verifyCount": {
      "sel": "span[class^=count_goods--]",
      "regex": "(\\d+)"
    },
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "selector",
      "sel": "div[class^='price_area--']",
      "regex": "총\\s*배송비(?:\\s*도움말)?\\s*([\\d,]+)\\s*원",
      "perFee": true
    }
  },
  {
    "id": "officedepot",
    "name": "오피스디포",
    "domains": [
      "officedepot.co.kr"
    ],
    "matchPatterns": [
      "*://*.officedepot.co.kr/*"
    ],
    "filterDomains": [
      "officedepot.co.kr"
    ],
    "rowSelector": "tr:has(input.itemId)",
    "rowBase": "tr",
    "checkbox": {
      "sel": "input.itemId",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "p.name a"
      },
      "qty": {
        "sel": "input.itemCount",
        "attr": "value"
      },
      "price": {
        "sel": "span.price:not(.rowPrice)",
        "regex": "([\\d,]+)"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input.itemId"
    },
    "priceIs": null,
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "conditional",
      "fee": 3000,
      "freeOver": 30000
    }
  },
  {
    "id": "st11-cart",
    "name": "11번가 장바구니",
    "domains": [
      "11st.co.kr"
    ],
    "matchPatterns": [
      "*://*.11st.co.kr/cart*"
    ],
    "filterDomains": [
      "11st.co.kr"
    ],
    "rowSelector": "li[id^=bunchPrdWrap_]",
    "rowBase": "li[id^=bunchPrdWrap_]",
    "checkbox": {
      "sel": "input[name^=bcktSeq_]",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": ".prd_name a"
      },
      "qty": {
        "sel": "button[title=수량변경]",
        "regex": "(\\d+)"
      },
      "price": {
        "sel": ".total_price .number",
        "regex": "([\\d,]+)"
      },
      "option": {
        "sel": "li.option"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input[name^=bcktSeq_]"
    },
    "priceIs": "lineTotal",
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "perItem",
      "sel": ".c-order-delivery__price .number",
      "regex": "([\\d,]+)"
    }
  },
  {
    "id": "teachermall-cart",
    "name": "티처몰 장바구니",
    "domains": [
      "teacherville.co.kr"
    ],
    "matchPatterns": [
      "*://*.teacherville.co.kr/order/cart*"
    ],
    "filterDomains": [
      "teacherville.co.kr"
    ],
    "rowSelector": "tr:has(input.chk01)",
    "rowBase": "tr",
    "checkbox": {
      "sel": "input.chk01",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "a.order_name"
      },
      "qty": {
        "sel": "input[id^=cart_cnt]",
        "attr": "value"
      },
      "price": {
        "sel": ".cost_info p.flexbox",
        "regex": "([\\d,]+)원"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input.chk01"
    },
    "priceIs": null,
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "selector",
      "sel": "em.fc_blue1",
      "regex": "배송비\\s*([\\d,]+)원",
      "checkedScope": true
    }
  },
  {
    "id": "yes24-cart",
    "name": "예스24 장바구니",
    "domains": [
      "yes24.com"
    ],
    "matchPatterns": [
      "*://*.yes24.com/dMyCart/CartMain*"
    ],
    "filterDomains": [
      "yes24.com"
    ],
    "rowSelector": "tbody tr:has(input[name=chkCartGoodsYes24])",
    "rowBase": "tbody tr",
    "checkbox": {
      "sel": "input[name=chkCartGoodsYes24]",
      "stateMode": "checked"
    },
    "productKey": null,
    "selectedState": null,
    "fields": {
      "name": {
        "sel": "div.goods_name a.pd_a"
      },
      "price": {
        "sel": "strong.price_txt",
        "regex": "([\\d,]+)원"
      }
    },
    "units": null,
    "checkedOnly": {
      "sel": "input[name=chkCartGoodsYes24]"
    },
    "priceIs": null,
    "specFromOption": false,
    "verifyCount": null,
    "qtyFromUnit": null,
    "qtyInputSel": null,
    "shipping": {
      "mode": "selector",
      "sel": "tfoot span:contains('배송비') strong.cost",
      "regex": "([\\d,]+)원",
      "freeOver": 15000
    }
  }
];

  // manifest.json content_scripts.matches / host_permissions 용 전체 패턴
  var HOST_PATTERNS = [
  "*://*.11st.co.kr/cart*",
  "*://*.aladin.co.kr/*",
  "*://*.alpha.co.kr/order/cart*",
  "*://*.cart.auction.co.kr/*",
  "*://*.cart.gmarket.co.kr/*",
  "*://*.coupang.com/*",
  "*://*.daisomall.co.kr/*",
  "*://*.dreamdepot.co.kr/*",
  "*://*.i-screammall.co.kr/order/cart*",
  "*://*.officedepot.co.kr/*",
  "*://*.order.kyobobook.co.kr/cart*",
  "*://*.screammall.co.kr/order/cart*",
  "*://*.shopping.naver.com/cart*",
  "*://*.teacherville.co.kr/order/cart*",
  "*://*.yes24.com/dMyCart/CartMain*"
];

  var api = { malls: MALLS, HOST_PATTERNS: HOST_PATTERNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AutoSelectRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
