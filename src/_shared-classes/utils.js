const round = require('../_utils/round');
/**
 * 
 * 
 * 
 * =================================
 * HELPER FUNCTIONS
 * =================================
 * 
 * 
 * 
 */

/**
 * 
 * 
 * 
 * =================================
 * UTILS DEFINITION
 * =================================
 * 
 * 
 * 
 */
/**
 * @param {import('../../typings/_utils').utilsOptions} utilsOptions 
 */
function Utils(utilsOptions) {
  const instrumentType = utilsOptions.instrumentType;
  const balanceType = utilsOptions.balanceType;
  const quantityType = utilsOptions.quantityType;
  const priceStep = utilsOptions.priceStep;
  const quantityValue = utilsOptions.quantityValue;
  const basePrecision = utilsOptions.basePrecision;
  const quotePrecision = utilsOptions.quotePrecision;
  const pricePrecision = utilsOptions.pricePrecision;
  const quantityPrecision = utilsOptions.quantityPrecision;
  /**
   * 
   * 
   * 
   * @type {import('../../typings/_utils').Utils}
   * 
   * 
   * 
   */
  const utils = {
    /**
     * 
     * 
     * GET ORDER ID
     * 
     * 
     */
    getOrderId: () => '',
    /**
     * 
     * 
     * GET OPEN ORDER QUANTITY FROM BALANCE
     * 
     * 
     */
    getOpenOrderQtyFromBalance: (() => {
      if (balanceType === 'base' && quantityType === 'base') {
        return (px, qty, rnd) => round[rnd](qty / quantityValue, quantityPrecision);
      }
      if (balanceType === 'base' && quantityType === 'quote') {
        return (px, qty, rnd) => round[rnd](qty / (quantityValue / px), quantityPrecision);
      }
      if (balanceType === 'quote' && quantityType === 'base') {
        return (px, qty, rnd) => round[rnd]((qty / px) / quantityValue, quantityPrecision);
      }
      throw new Error('Could not find function of getOpenOrderQtyFromBalance');
    })(),
    /**
     * 
     * 
     * GET CLOSE ORDER QUANTITY FROM OPEN POSITION
     * 
     * 
     */
    getCloseOrderQtyFromOpenPosition: (() => {
      if (instrumentType === 'spot') {
        if (balanceType === 'base' && quantityType === 'base') {
          return (px, qty, rnd) => round[rnd]((qty / px) / quantityValue, quantityPrecision);
        }
        if (balanceType === 'quote' && quantityType === 'base') {
          return (px, qty, rnd) => round[rnd](qty, quantityPrecision);
        }
      }
      if (instrumentType === 'future') {
        return (px, qty, rnd) => round[rnd](qty, quantityPrecision);
      }
      throw new Error('Could not find function of getCloseOrderQtyFromOpenPosition');
    })(),
    /**
     * 
     * 
     * GET OPEN POSITION QTY FROM OPEN EXECUTION
     * 
     * 
     */
    getOpenPositionQtyFromOpenExecution: (() => {
      if (instrumentType === 'spot') {
        if (balanceType === 'base' && quantityType === 'base') {
          return (px, qty, rnd) => round[rnd]((qty * quantityValue) * px, quotePrecision);
        }
        if (balanceType === 'quote' && quantityType === 'base') {
          return (px, qty, rnd) => round[rnd](qty, quantityPrecision);
        }
      }
      if (instrumentType === 'future') {
        return (px, qty, rnd) => round[rnd](qty, quantityPrecision);
      }
      throw new Error('Could not find function of getOpenPositionQtyFromOpenExecution');
    })(),
    /**
     * 
     * 
     * GET PNL
     * 
     * 
     */
    getPnl: (() => {
      if (instrumentType === 'spot') {
        if (balanceType === 'base' && quantityType === 'base') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            const entFeeBal = (qty / entPx) * entFee;
            const extFeeBal = (qty / extPx) * extFee;
            const pnl = qty / extPx - qty / entPx;
            return round.normal(pnl - entFeeBal - extFeeBal, basePrecision);
          }
        }
        if (balanceType === 'quote' && quantityType === 'base') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            const entFeeBal = ((qty * quantityValue) * entPx) * entFee;
            const extFeeBal = ((qty * quantityValue) * extPx) * extFee;
            const pnl = (extPx - entPx) * (qty * quantityValue);
            return round.normal(pnl - entFeeBal - extFeeBal, quotePrecision);
          }
        }
      }
      if (instrumentType === 'future') {
        if (balanceType === 'base' && quantityType === 'base') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            const entFeeBal = (qty * quantityValue) * entFee;
            const extFeeBal = (qty * quantityValue) * extFee;
            const pxDiff = side === 'sell' ? (entPx - extPx) : (extPx - entPx);
            const pnl = (pxDiff * (qty * quantityValue)) / extPx;
            return round.normal(pnl - entFeeBal - extFeeBal, basePrecision);
          }
        }
        if (balanceType === 'base' && quantityType === 'quote') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            const entFeeBal = ((qty * quantityValue) / entPx) * entFee;
            const extFeeBal = ((qty * quantityValue) / extPx) * extFee;
            const pxDiff = side === 'sell'
              ? ((qty * quantityValue) / extPx - (qty * quantityValue) / entPx)
              : ((qty * quantityValue) / entPx - (qty * quantityValue) / extPx);
            const pnl = pxDiff * qty;
            return round.normal(pnl - entFeeBal - extFeeBal, basePrecision);
          }
        }
        if (balanceType === 'quote' && quantityType === 'base') {
          return (qty, side, entPx, extPx, entFee, extFee) => {
            const entFeeBal = ((qty * quantityValue) * entPx) * entFee;
            const extFeeBal = ((qty * quantityValue) * extPx) * extFee;
            const pxDiff = side === 'sell' ? (entPx - extPx) : (extPx - entPx);
            const pnl = pxDiff * (qty * quantityValue);
            return round.normal(pnl - entFeeBal - extFeeBal, quotePrecision);
          }
        }
      }
      throw new Error('Could not find function of getPnl');
    })(),
    /**
     * 
     * 
     * GET OB BEST ASK
     * 
     * 
     */
    getOBBestAsk: (() => {
      return (ob) => round.normal(ob.asks[0].price - priceStep, pricePrecision);
    })(),
    /**
     * 
     * 
     * GET OB BEST BID
     * 
     * 
     */
    getOBBestBid: (() => {
      return (ob) => round.normal(ob.bids[0].price + priceStep, pricePrecision);
    })(),
    /**
     * 
     * 
     * GET OB EXECUTION PRICE
     * 
     * 
     */
    getOBExecutionPrice: (() => {
      if (balanceType === 'base' && quantityType === 'base') {
        return (ob, obType, bal, skipVol, skipLevels, skipPer) => {
          let qtyNB = 0;
          let qtyNQ = 0;
          const orders = ob[obType];
          const skipPrice = orders[0].price * (1 + (obType === 'asks' ? +skipPer : -skipPer));
          const skipPriceIndex = orders.findIndex(v => obType === 'asks' ? (v.price > skipPrice) : (v.price < skipPrice));
          const obStartIndex = skipLevels > skipPriceIndex ? skipLevels : skipPriceIndex;
          for (let i = obStartIndex; bal && orders[i]; i += 1) {
            const order = orders[i];
            let orderNB = order.quantity * quantityValue;
            if (skipVol > orderNB) {
              skipVol = skipVol - orderNB; orderNB = 0;
            } else {
              orderNB = orderNB - skipVol; skipVol = 0;
            }
            const execNB = orderNB < bal ? orderNB : bal;
            const execNQ = execNB * order.price;
            qtyNB = qtyNB + execNB;
            qtyNQ = qtyNQ + execNQ;
            bal = bal > execNB ? bal - execNB : 0;
          }
          return round.normal(qtyNQ / qtyNB, pricePrecision);
        };
      }
      if (balanceType === 'base' && quantityType === 'quote') {
        return (ob, obType, bal, skipVol, skipLevels, skipPer) => {
          let qtyNB = 0;
          let qtyNQ = 0;
          const orders = ob[obType];
          const skipPrice = orders[0].price * (1 + (obType === 'asks' ? +skipPer : -skipPer));
          const skipPriceIndex = orders.findIndex(v => obType === 'asks' ? (v.price > skipPrice) : (v.price < skipPrice));
          const obStartIndex = skipLevels > skipPriceIndex ? skipLevels : skipPriceIndex;
          for (let i = obStartIndex; bal && orders[i]; i += 1) {
            const order = orders[i];
            let orderNB = (quantityValue / order.price) * order.quantity;
            if (skipVol > orderNB) {
              skipVol = skipVol - orderNB; orderNB = 0;
            } else {
              orderNB = orderNB - skipVol; skipVol = 0;
            }
            const execNB = orderNB < bal ? orderNB : bal;
            const execNQ = execNB * order.price;
            qtyNB = qtyNB + execNB;
            qtyNQ = qtyNQ + execNQ;
            bal = bal > execNB ? bal - execNB : 0;
          }
          return round.normal(qtyNQ / qtyNB, pricePrecision);
        };
      }
      if (balanceType === 'quote' && quantityType === 'base') {
        return (ob, obType, bal, skipVol, skipLevels, skipPer) => {
          let qtyNB = 0;
          let qtyNQ = 0;
          const orders = ob[obType];
          const skipPrice = orders[0].price * (1 + (obType === 'asks' ? +skipPer : -skipPer));
          const skipPriceIndex = orders.findIndex(v => obType === 'asks' ? (v.price > skipPrice) : (v.price < skipPrice));
          const obStartIndex = skipLevels > skipPriceIndex ? skipLevels : skipPriceIndex;
          for (let i = obStartIndex; bal && orders[i]; i += 1) {
            const order = orders[i];
            let orderNQ = (order.quantity * quantityValue) * order.price;
            if (skipVol > orderNQ) {
              skipVol = skipVol - orderNQ; orderNQ = 0;
            } else {
              orderNQ = orderNQ - skipVol; skipVol = 0;
            }
            const execNQ = orderNQ < bal ? orderNQ : bal;
            const execNB = orderNQ / order.price;
            qtyNQ = qtyNQ + execNQ;
            qtyNB = qtyNB + execNB;
            bal = bal > orderNQ ? bal - orderNQ : 0;
          }
          return round.normal(qtyNQ / qtyNB, pricePrecision);
        };
      }
      throw new Error('Could not find function of getOBExecutionPrice');
    })(),
    /**
     * 
     * 
     * GET BAL INV FROM POSITION
     * 
     * 
     */
    getBalInvFromPosition: (() => {
      if (instrumentType === 'spot') {
        if (balanceType === 'base' && quantityType === 'base') {
          return (px, qty) => {
            return round.normal(qty / px, basePrecision);
          }
        }
        if (balanceType === 'quote' && quantityType === 'base') {
          return (px, qty) => {
            return round.normal((qty * quantityValue) * px, quotePrecision);
          }
        }
      }
      if (instrumentType === 'future') {
        if (balanceType === 'base' && quantityType === 'base') {
          return (px, qty) => {
            return round.normal(qty * quantityValue, basePrecision);
          }
        }
        if (balanceType === 'base' && quantityType === 'quote') {
          return (px, qty) => {
            return round.normal((quantityValue / px) * qty, basePrecision);
          }
        }
        if (balanceType === 'quote' && quantityType === 'base') {
          return (px, qty) => {
            return round.normal(((qty * quantityValue) * px), quotePrecision);
          }
        }
      }
      throw new Error('Could not find function of getBalInvFromPosition');
    })(),
    /**
     * 
     * 
     * GET VALUE NB FROM POSITION
     * 
     * 
     */
    getNBValueFromPosition: (() => {
      if (instrumentType === 'spot') {
        if (balanceType === 'base') {
          return (px, qty) => {
            return round.normal(qty / px, basePrecision);
          }
        }
        if (balanceType === 'quote') {
          return (px, qty) => {
            return round.normal(qty * quantityValue, basePrecision);
          }
        }
      }
      if (instrumentType === 'future') {
        if (quantityType === 'base') {
          return (px, qty) => {
            return round.normal(qty * quantityValue, basePrecision);
          }
        }
        if (quantityType === 'quote') {
          return (px, qty) => {
            return round.normal((qty * quantityValue) / px, basePrecision);
          }
        }
      }
      throw new Error('Could not find function of getNBValueFromPosition');
    })(),
    /**
     * 
     * 
     * GET VALUE NQ FROM POSITION
     * 
     * 
     */
    getNQValueFromPosition: (() => {
      if (instrumentType === 'spot') {
        if (balanceType === 'base') {
          return (px, qty) => {
            return round.normal(qty, quotePrecision);
          }
        }
        if (balanceType === 'quote') {
          return (px, qty) => {
            return round.normal((qty * quantityValue) * px, quotePrecision);
          }
        }
      }
      if (instrumentType === 'future') {
        if (quantityType === 'base') {
          return (px, qty) => {
            return round.normal((qty * quantityValue) * px, quotePrecision);
          }
        }
        if (quantityType === 'quote') {
          return (px, qty) => {
            return round.normal(qty * quantityValue, quotePrecision);
          }
        }
      }
      throw new Error('Could not find function of getNQValueFromPosition');
    })(),
  };
  return utils;
}
module.exports = Utils;
