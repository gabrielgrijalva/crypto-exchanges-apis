/**
  * 
  * 
  * 
  * HELPER FUNCTIONS
  * 
  * 
  * 
  */
/**
 * @param {number} id
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders 
 */
function findOrderIndexById(id, orders) {
  return orders.findIndex(v => v.id === id);
};
/**
  * @param {number} price
  * @param {import('../../typings/_ws').orderBooksOrder[]} orders 
  */
function findOrderIndexByPriceAsk(price, orders) {
  return orders.findIndex(v => v.price >= price);
};
/**
 * @param {number} price
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders 
 */
function findOrderIndexByPriceBid(price, orders) {
  return orders.findIndex(v => v.price <= price);
};
/**
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders
 * @returns {(update: import('../../typings/_ws').orderBooksOrder) => void}
 */
function getDeleteOrderById(orders) {
  return function deleteOrderById(update) {
    const index = findOrderIndexById(update.id, orders);
    const orderToDelete = orders[index];
    if (orderToDelete) {
      orders.splice(index, 1);
    }
  };
};
/**
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders
 * @returns {(update: import('../../typings/_ws').orderBooksOrder) => void}
 */
function getUpdateOrderById(orders) {
  return function updateOrderById(update) {
    const index = findOrderIndexById(update.id, orders);
    const orderToUpdate = orders[index];
    if (orderToUpdate) {
      if (update.price) {
        orderToUpdate.price = update.price;
      }
      if (update.quantity) {
        orderToUpdate.quantity = update.quantity;
      }
    }
  };
};
/**
 * @param {'asks' | 'bids'} side 
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders
 * @returns {(update: import('../../typings/_ws').orderBooksOrder) => void}
 */
function getUpdateOrderByPrice(side, orders) {
  const findOrderIndexByPrice = side === 'asks' ? findOrderIndexByPriceAsk : findOrderIndexByPriceBid;
  return function updateOrderByPrice(update) {
    const index = findOrderIndexByPrice(update.price, orders);
    const orderToUpdate = orders[index];
    if (orderToUpdate) {
      if (orderToUpdate.price === update.price) {
        if (!update.quantity) {
          orders.splice(index, 1);
        } else {
          orderToUpdate.quantity = update.quantity;
        }
      } else {
        if (update.quantity) {
          orders.splice(index, 0, update);
        }
      }
    } else {
      if (update.quantity) {
        orders.splice(orders.length, 0, update);
      }
    }
  };
};
/** 
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders
 * @returns {(snapshot: import('../../typings/_ws').orderBooksOrder[]) => void}
 */
function getInsertSnapshotFunction(orders) {
  return function insertSnapshotFunction(snapshot) {
    orders.length = 0;
    snapshot.forEach(v => orders.push(v));
  };
};
/** 
 * @param {import('../../typings/_ws').orderBooksSettings} orderBooksSettings
 */
function OrderBooksData(orderBooksSettings = {}) {
  orderBooksSettings.FROZEN_CHECK_INTERVAL = orderBooksSettings.FROZEN_CHECK_INTERVAL || 30000;
  orderBooksSettings.PRICE_OVERLAPS_CHECK_INTERVAL = orderBooksSettings.PRICE_OVERLAPS_CHECK_INTERVAL || 5000;
  /** @type {import('../../typings/_ws').orderBooksOrder[]} */
  const asks = [];
  /** @type {import('../../typings/_ws').orderBooksOrder[]} */
  const bids = [];
  /** @type {any} */
  let priceOverlapsInverval = null;
  /**
   * 
   * 
   *
   * 
   * @type {import('../../typings/_ws').orderBooksData}
   * 
   * 
   * 
   */
  const orderBooksData = {
    symbol: orderBooksSettings.SYMBOL,
    asks: asks,
    bids: bids,
    otherData: {},
    // Action by id
    deleteOrderByIdAsk: getDeleteOrderById(asks),
    deleteOrderByIdBid: getDeleteOrderById(bids),
    updateOrderByIdAsk: getUpdateOrderById(asks),
    updateOrderByIdBid: getUpdateOrderById(bids),
    // Action by price
    updateOrderByPriceAsk: getUpdateOrderByPrice('asks', asks),
    updateOrderByPriceBid: getUpdateOrderByPrice('bids', bids),
    // Insert snapshot
    insertSnapshotAsks: getInsertSnapshotFunction(asks),
    insertSnapshotBids: getInsertSnapshotFunction(bids),
  };
  let lastSnapshotAsks = '';
  let lastSnapshotBids = '';
  let lastOverlapBid = 0;
  let lastOverlapAsk = 0;
  let overlapPriceCounter = 0;
  function priceOverlapsCheck(){
    if (!orderBooksData.asks[0] || !orderBooksData.bids[0]) { return };
    if (orderBooksData.asks[0].price <= orderBooksData.bids[0].price) {
      if (!overlapPriceCounter) { 
        console.log(Date.now(), 'Orderbook Price Overlap')
        lastOverlapAsk = orderBooksData.asks[0].price
        lastOverlapBid = orderBooksData.bids[0].price
        overlapPriceCounter++ ; return
      };
      console.log('Bid/Ask Overlap:', orderBooksData.asks[0].price, orderBooksData.bids[0].price)
      throw { error: { type: 'order-book-price-overlaps', params: null, exchange: null } };
    } else {
      if (lastOverlapBid === orderBooksData.bids[0].price || lastOverlapAsk === orderBooksData.asks[0].price ){
        throw { error: { type: 'order-book-price-overlaps', params: null, exchange: null } };
      }
      if (overlapPriceCounter) {
        console.log(Date.now(), 'Clearing Price Overlap');
        lastOverlapBid = 0;
        lastOverlapAsk = 0;
        overlapPriceCounter = 0 ;
      } 
    }
  };
  function orderBookFrozenCheck(){
    const currentSnapshotAsks = JSON.stringify(orderBooksData.asks.slice(0, 10));
    const currentSnapshotBids = JSON.stringify(orderBooksData.bids.slice(0, 10));
    if (lastSnapshotAsks === currentSnapshotAsks && lastSnapshotBids === currentSnapshotBids) {
      throw { error: { type: 'order-book-frozen', params: null, exchange: null } };
    }
    lastSnapshotAsks = currentSnapshotAsks;
    lastSnapshotBids = currentSnapshotBids;
  };
  setInterval(() => {
    orderBookFrozenCheck();
  }, orderBooksSettings.FROZEN_CHECK_INTERVAL);

  setInterval(() => {
    priceOverlapsCheck();
  }, orderBooksSettings.PRICE_OVERLAPS_CHECK_INTERVAL);

  return orderBooksData;

};
module.exports = OrderBooksData;
