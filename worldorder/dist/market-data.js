// Explicitly verified base market effects; other faces remain manual.
export const MARKET_CARDS={
  "cfefb40dc1370": {
    "name": "投资回报",
    "effect": "invest",
    "moneyPerFDI": 4
  },
  "c0fd5d4980884": {
    "name": "建立新大使馆",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations",
          "relationDiscount": 1
        }
      },
      {
        "type": "reset",
        "region": "$region",
        "optional": true
      }
    ]
  },
  "c4c66721efb32": {
    "name": "支配力量",
    "effect": "engage",
    "engageDiscount": "armies"
  },
  "c005fe582851b": {
    "name": "外交出访",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      },
      {
        "type": "effect",
        "card": {
          "effect": "engage",
          "targetRegion": "$region"
        }
      }
    ]
  },
  "c29651891b636": {
    "name": "关键经济伙伴",
    "effect": "invest",
    "readyTarget": true,
    "keepReady": true
  },
  "c6ebb892bb47a": {
    "name": "量化宽松",
    "effect": "invest",
    "moneyBefore": 10
  },
  "cf3fcb0ecde0d": {
    "name": "新议程",
    "effect": "sequence",
    "steps": [
      {
        "type": "draw",
        "count": 3
      },
      {
        "type": "discardToPlay",
        "count": 2
      }
    ]
  },
  "ccc7e92e23c6c": {
    "name": "建立贸易路线",
    "effect": "sequence",
    "steps": [
      {
        "type": "region"
      },
      {
        "type": "effect",
        "card": {
          "effect": "trade",
          "virtualRegions": [
            "$region"
          ]
        }
      },
      {
        "type": "reset",
        "region": "$region"
      }
    ]
  },
  "c1572d344b120": {
    "name": "开拓新市场",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      },
      {
        "type": "chooseActions",
        "options": {
          "invest": [
            {
              "type": "effect",
              "card": {
                "effect": "invest",
                "targetCountry": "$country"
              }
            }
          ],
          "trade": [
            {
              "type": "effect",
              "card": {
                "effect": "trade"
              }
            }
          ]
        },
        "count": 1
      }
    ]
  },
  "c46731b5878a9": {
    "name": "优化官僚机构",
    "effect": "sequence",
    "trashOnPlay": true,
    "steps": [
      {
        "type": "researchPlay",
        "maxCost": 6
      }
    ]
  },
  "cec3c7dab7cfc": {
    "name": "军事演习",
    "effect": "reinforce",
    "armyGain": 0,
    "maxMoves": 3,
    "resetAfterMoves": true
  },
  "c53925f3f9778": {
    "name": "贸易机会",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "trade",
          "maxTradeTypes": 1
        }
      },
      {
        "type": "extra"
      }
    ]
  },
  "cad6fdc8dd2f6": {
    "name": "建设性谈判",
    "effect": "sequence",
    "steps": [
      {
        "type": "readyAlly"
      },
      {
        "type": "searchRegion"
      }
    ]
  },
  "cc5811cf03bcd": {
    "name": "新战略伙伴",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      },
      {
        "type": "chooseActions",
        "options": {
          "base": [
            {
              "type": "effect",
              "card": {
                "effect": "base",
                "targetCountry": "$country"
              }
            }
          ],
          "move": [
            {
              "type": "effect",
              "card": {
                "effect": "reinforce",
                "armyGain": 0,
                "maxMoves": 2,
                "destinationOverride": "$region",
                "onlyDestination": "$region"
              }
            }
          ]
        },
        "count": 1
      }
    ]
  },
  "ccde924d96e22": {
    "name": "开拓新市场",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      },
      {
        "type": "chooseActions",
        "options": {
          "invest": [
            {
              "type": "effect",
              "card": {
                "effect": "invest",
                "targetCountry": "$country"
              }
            }
          ],
          "trade": [
            {
              "type": "effect",
              "card": {
                "effect": "trade"
              }
            }
          ]
        },
        "count": 1
      }
    ]
  },
  "c09eff717eed0": {
    "name": "战略再评估",
    "effect": "sequence",
    "steps": [
      {
        "type": "chooseActions",
        "options": {
          "relations": [
            {
              "type": "effect",
              "card": {
                "effect": "relations"
              }
            }
          ],
          "trade": [
            {
              "type": "effect",
              "card": {
                "effect": "trade"
              }
            }
          ],
          "move": [
            {
              "type": "effect",
              "card": {
                "effect": "reinforce",
                "armyGain": 0,
                "maxMoves": 2
              }
            }
          ]
        },
        "count": 2
      }
    ]
  },
  "c51a975a823b1": {
    "name": "建立新大使馆",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations",
          "relationDiscount": 1
        }
      },
      {
        "type": "reset",
        "region": "$region",
        "optional": true
      }
    ]
  },
  "cdae00d5d8c03": {
    "name": "真知灼见",
    "effect": "choice",
    "choices": [
      "relations",
      "engage"
    ],
    "diplomacyBefore": 2
  },
  "c6e4105c56893": {
    "name": "全球部署",
    "effect": "reinforce",
    "armyGain": 0,
    "maxMoves": 3,
    "produceArmies": true
  },
  "c7c891971aff3": {
    "name": "加强同盟",
    "effect": "base",
    "baseLimit": 2
  },
  "c4ae0932e9a29": {
    "name": "优化流程",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "domestic",
          "domesticMode": "produce",
          "maxProduction": 1
        }
      },
      {
        "type": "effect",
        "card": {
          "effect": "domestic",
          "domesticMode": "growth"
        }
      }
    ]
  },
  "cf0bb7e3d7187": {
    "name": "产业扩张",
    "effect": "sequence",
    "steps": [
      {
        "type": "upgradeProduce"
      },
      {
        "type": "extra"
      }
    ]
  },
  "cdc23c4e1dfcb": {
    "name": "强权游戏",
    "effect": "base",
    "permanentOverflow": true
  },
  "c9d44af84d687": {
    "name": "军事演习",
    "effect": "reinforce",
    "armyGain": 0,
    "maxMoves": 3,
    "resetAfterMoves": true
  },
  "c04dd953d9067": {
    "name": "激活盟友",
    "effect": "engage",
    "readyBefore": 2
  },
  "caebb995e4467": {
    "name": "秘密军事行动",
    "effect": "base",
    "produceArmies": true
  },
  "cfaad0c7090c9": {
    "name": "探索新方案",
    "effect": "sequence",
    "steps": [
      {
        "type": "draw",
        "count": 2
      },
      {
        "type": "extra"
      }
    ]
  },
  "ce3a62cfc529a": {
    "name": "周密计划",
    "effect": "sequence",
    "steps": [
      {
        "type": "draw",
        "count": 1
      },
      {
        "type": "effect",
        "card": {
          "effect": "base"
        }
      }
    ]
  },
  "c9249203476e6": {
    "name": "贸易机会",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "trade",
          "maxTradeTypes": 1
        }
      },
      {
        "type": "extra"
      }
    ]
  },
  "cb72ba916f116": {
    "name": "关键经济伙伴",
    "effect": "invest",
    "readyTarget": true,
    "keepReady": true
  },
  "c42bce4822a20": {
    "name": "经济扩张",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "trade"
        }
      },
      {
        "type": "effect",
        "card": {
          "effect": "invest"
        }
      }
    ]
  },
  "c0cc7b0a3192b": {
    "name": "真知灼见",
    "effect": "choice",
    "choices": [
      "relations",
      "engage"
    ],
    "diplomacyBefore": 2
  },
  "cbbb4f2d74bd6": {
    "name": "繁荣时代",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "domestic",
          "domesticMode": "produce",
          "maxProduction": 1,
          "fixedProductionKey": 3
        }
      },
      {
        "type": "chooseActions",
        "options": {
          "prosperity": [
            {
              "type": "prosperity",
              "cost": 2
            }
          ],
          "extra": [
            {
              "type": "extra"
            }
          ]
        },
        "count": 1
      }
    ]
  },
  "c3a9543fd0ed4": {
    "name": "探索新方案",
    "effect": "sequence",
    "steps": [
      {
        "type": "draw",
        "count": 2
      },
      {
        "type": "extra"
      }
    ]
  },
  "c6a0f97511ee5": {
    "name": "重审协议",
    "effect": "sequence",
    "steps": [
      {
        "type": "reset"
      },
      {
        "type": "draw",
        "count": 1
      },
      {
        "type": "extra"
      }
    ]
  },
  "ca19359e77bd9": {
    "name": "稳定伙伴关系",
    "effect": "invest",
    "investmentLimit": 2
  },
  "ccc7712b6917f": {
    "name": "保障地区和平",
    "effect": "engage",
    "engageDiscount": "allies"
  },
  "cfecf51ce6834": {
    "name": "全球部署",
    "effect": "reinforce",
    "armyGain": 0,
    "maxMoves": 3,
    "produceArmies": true
  },
  "c867ad64da08e": {
    "name": "保障地区和平",
    "effect": "engage",
    "engageDiscount": "allies"
  },
  "c173f667d9b2e": {
    "name": "外交出访",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      },
      {
        "type": "effect",
        "card": {
          "effect": "engage",
          "targetRegion": "$region"
        }
      }
    ]
  },
  "cb4a8c3a84087": {
    "name": "秘密军事行动",
    "effect": "base",
    "produceArmies": true
  },
  "cbf738dd1acfe": {
    "name": "建设性谈判",
    "effect": "sequence",
    "steps": [
      {
        "type": "readyAlly"
      },
      {
        "type": "searchRegion"
      }
    ]
  },
  "c004a2300afc3": {
    "name": "改善后勤",
    "effect": "base",
    "maxBaseArmies": 3,
    "freeBaseDeployment": true
  },
  "ce1c46c7de91a": {
    "name": "启动重组",
    "effect": "sequence",
    "steps": [
      {
        "type": "draw",
        "count": 1
      },
      {
        "type": "trashToPlay"
      }
    ]
  },
  "ca4d4b3217c6d": {
    "name": "分配新外交官",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      },
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      }
    ]
  },
  "c407857efeff9": {
    "name": "新议程",
    "effect": "sequence",
    "steps": [
      {
        "type": "draw",
        "count": 3
      },
      {
        "type": "discardToPlay",
        "count": 2
      }
    ]
  },
  "cae9499ebf09c": {
    "name": "优化流程",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "domestic",
          "domesticMode": "produce",
          "maxProduction": 1
        }
      },
      {
        "type": "effect",
        "card": {
          "effect": "domestic",
          "domesticMode": "growth"
        }
      }
    ]
  },
  "c30c51ddfd182": {
    "name": "支配力量",
    "effect": "engage",
    "engageDiscount": "armies"
  },
  "c5990a2eb2dcd": {
    "name": "优化官僚机构",
    "effect": "sequence",
    "trashOnPlay": true,
    "steps": [
      {
        "type": "researchPlay",
        "maxCost": 6
      }
    ]
  },
  "c8cfb1166d061": {
    "name": "强权游戏",
    "effect": "base",
    "permanentOverflow": true
  },
  "ca64ae7f7c395": {
    "name": "建立贸易路线",
    "effect": "sequence",
    "steps": [
      {
        "type": "region"
      },
      {
        "type": "effect",
        "card": {
          "effect": "trade",
          "virtualRegions": [
            "$region"
          ]
        }
      },
      {
        "type": "reset",
        "region": "$region"
      }
    ]
  },
  "cf48940571b47": {
    "name": "重审协议",
    "effect": "sequence",
    "steps": [
      {
        "type": "reset"
      },
      {
        "type": "draw",
        "count": 1
      },
      {
        "type": "extra"
      }
    ]
  },
  "c60ff722572ab": {
    "name": "激活盟友",
    "effect": "engage",
    "readyBefore": 2
  },
  "c71ceedd0e999": {
    "name": "加强同盟",
    "effect": "base",
    "baseLimit": 2
  },
  "c6fc6d11e9093": {
    "name": "投资回报",
    "effect": "invest",
    "moneyPerFDI": 4
  },
  "cf14f95eee019": {
    "name": "周密计划",
    "effect": "sequence",
    "steps": [
      {
        "type": "draw",
        "count": 1
      },
      {
        "type": "effect",
        "card": {
          "effect": "base"
        }
      }
    ]
  },
  "c01bd587c0b23": {
    "name": "分配新外交官",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      },
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      }
    ]
  },
  "ca37294c3a8f9": {
    "name": "繁荣时代",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "domestic",
          "domesticMode": "produce",
          "maxProduction": 1,
          "fixedProductionKey": 3
        }
      },
      {
        "type": "chooseActions",
        "options": {
          "prosperity": [
            {
              "type": "prosperity",
              "cost": 2
            }
          ],
          "extra": [
            {
              "type": "extra"
            }
          ]
        },
        "count": 1
      }
    ]
  },
  "cabede0e0b890": {
    "name": "改善后勤",
    "effect": "base",
    "maxBaseArmies": 3,
    "freeBaseDeployment": true
  },
  "cc717f2040d03": {
    "name": "启动重组",
    "effect": "sequence",
    "steps": [
      {
        "type": "draw",
        "count": 1
      },
      {
        "type": "trashToPlay"
      }
    ]
  },
  "ca78a66eaec3f": {
    "name": "量化宽松",
    "effect": "invest",
    "moneyBefore": 10
  },
  "c11cd1894962e": {
    "name": "经济扩张",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "trade"
        }
      },
      {
        "type": "effect",
        "card": {
          "effect": "invest"
        }
      }
    ]
  },
  "c14d8766dc80e": {
    "name": "稳定伙伴关系",
    "effect": "invest",
    "investmentLimit": 2
  },
  "cce333dc16cb5": {
    "name": "产业扩张",
    "effect": "sequence",
    "steps": [
      {
        "type": "upgradeProduce"
      },
      {
        "type": "extra"
      }
    ]
  },
  "ccf3fe3c30b0b": {
    "name": "新战略伙伴",
    "effect": "sequence",
    "steps": [
      {
        "type": "effect",
        "card": {
          "effect": "relations"
        }
      },
      {
        "type": "chooseActions",
        "options": {
          "base": [
            {
              "type": "effect",
              "card": {
                "effect": "base",
                "targetCountry": "$country"
              }
            }
          ],
          "move": [
            {
              "type": "effect",
              "card": {
                "effect": "reinforce",
                "armyGain": 0,
                "maxMoves": 2,
                "destinationOverride": "$region",
                "onlyDestination": "$region"
              }
            }
          ]
        },
        "count": 1
      }
    ]
  },
  "c815968247509": {
    "name": "战略再评估",
    "effect": "sequence",
    "steps": [
      {
        "type": "chooseActions",
        "options": {
          "relations": [
            {
              "type": "effect",
              "card": {
                "effect": "relations"
              }
            }
          ],
          "trade": [
            {
              "type": "effect",
              "card": {
                "effect": "trade"
              }
            }
          ],
          "move": [
            {
              "type": "effect",
              "card": {
                "effect": "reinforce",
                "armyGain": 0,
                "maxMoves": 2
              }
            }
          ]
        },
        "count": 2
      }
    ]
  }
};
