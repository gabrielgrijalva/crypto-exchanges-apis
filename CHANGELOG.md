# Changelog
All notable changes to this project will be documented in this file.

## [2.14.6] - 2024-01-23
- Corrected project version.
## [2.14.4] - 2024-01-23
- Added new function to exchanges implementations.
## [2.14.3] - 2023-04-26
- Corrected error order liquidation type in _ws huobi-swap api.
## [2.14.2] - 2023-04-26
- Changed bitmex variable from avgEntryPrice to avgCostPrice.
## [2.14.1] - 2023-04-05
- Minor changes in phemex API.
## [2.14.0] - 2023-03-10
- Implemented binance-spot api.
## [2.13.7] - 2023-03-03
- ADL and liquidation implementation for bitmex, binance-coin. Liquidation implementation for huobi-swap.
## [2.13.6] - 2023-03-03
- ADL and liquidation implementation for phemex, okx, gateio, coinex, bybit-usdt and bybit API.
## [2.13.5] - 2023-03-01
- Minor bug fixes.
## [2.13.4] - 2023-02-26
- Minor bug fixes to huobi-swap api.
## [2.13.3] - 2023-02-24
- Bug fixes. Implemented Flatted to all APIs to handle circular JSON strings. Added callingFunction to error handler for debugging purposes.
## [2.13.2] - 2023-02-21
- Implemented Flatted to handle circular JSON strings.
## [2.13.1] - 2023-02-21
- Bug fixes. Minor changes in error handling.
## [2.13.0] - 2023-02-15
- Implemented kucoin api. Modified rate limit impelmentation.
## [2.12.0] - 2023-01-21
- Implemented bitget api.
## [2.11.6] - 2022-12-22
- nextFundingRate hour bug fix.
## [2.11.5] - 2022-12-21
- Added nextFundingRate in fundingRate object for bybit-usdt, gateio, okx and binance-usds.
## [2.11.4] - 2022-12-09
- Corrected error in bybit rest get liquidation.
## [2.11.3] - 2022-12-09
- Corrected error in bitmex ws positions.
## [2.11.2] - 2022-12-08
- Bug fixes and improvements.
## [2.11.1] - 2022-11-14
- Bug fixes and improvements.
## [2.11.0] - 2022-11-07
- Modified gateio api to support usdt and btc. Bybit-usdt api bug fixes.
## [2.10.0] - 2022-11-06
- Implemented bybit-usdt api.
## [2.9.0] - 2022-10-31
- Implemented huobi-swap api.
## [2.8.8] - 2022-10-11
- Modified Phemex API impelementation. Bug fixes.
## [2.8.7] - 2022-10-11
- Implemented real time exchange requests. API-ready + Phemex, Bitmex.
## [2.8.6] - 2022-10-10
- Modified Phemex update order implementation.
## [2.8.5] - 2022-10-08
- Minor bug fixes.
## [2.8.4] - 2022-10-08
- NPM Publish error fix.
## [2.8.3] - 2022-10-08
- WS positions bugfix.
## [2.8.2] - 2022-10-06
- Changed candle populator to each 30s.
## [2.8.1] - 2022-10-06
- Minor bugfixes in phemex api.
## [2.8.0] - 2022-10-06
- Implemented phemex api.
## [2.7.0] - 2022-09-19
- Changed okex to okx.
## [2.6.10] - 2022-06-19
- Corrected error in gateio-btc rest.
## [2.6.9] - 2022-06-17
- Renamed gate.io-btc to gateio.btc.
## [2.6.8] - 2022-06-17
- Implemented gate.io-btc exchange implementation.
## [2.6.7] - 2022-06-15
- Added error handler to okex rest.
## [2.6.6] - 2022-06-13
- Corrected error in deribit ws.
## [2.6.5] - 2022-06-11
- Added error handler to bitmex rest.
## [2.6.4] - 2022-06-10
- Corrected error in binances rest implementations.
## [2.6.3] - 2022-06-10
- Added immidiate-or-cancel error handler to rest kraken.
## [2.6.2] - 2022-06-09
- Corrected error in fixer.
## [2.6.1] - 2022-06-09
- Changed fixer to post only orders.
## [2.6.0] - 2022-06-09
- Changed rest order types and added immidiate or cancel.
## [2.5.0] - 2022-06-08
- Implemented limit-market create order in rest exchanges.
## [2.4.12] - 2022-06-07
- Corrected error in fixer.
## [2.4.11] - 2022-06-07
- Corrected error in populator of timezone default.
## [2.4.10] - 2022-06-07
- Corrected fixer errors.
## [2.4.9] - 2022-06-07
- Corrected websocket errors in coinex.
## [2.4.8] - 2022-06-02
- Corrected error in coinex rest implementation.
## [2.4.7] - 2022-06-01
- Corrected rest error handling in okex exchange.
## [2.4.6] - 2022-06-01
- Added error handler to coinex rest.
## [2.4.5] - 2022-06-01
- Implemented coinex exchange.
## [2.4.4] - 2022-05-25
- General corrections to exchanges websockets.
## [2.4.3] - 2022-05-25
- Corrected error in deribit order book implementation.
## [2.4.2] - 2022-05-20
- Corrected errors in okex rest.
## [2.4.1] - 2022-05-20
- Added close event functions to exchanges websockets implementations.
## [2.4.0] - 2022-05-19
- Corrected error in bitmex rest get equity.
## [2.3.9] - 2022-05-16
- Implemented positions ws events emitter.
## [2.3.8] - 2022-05-16
- Implemented binance-usds.
## [2.3.7] - 2022-05-13
- Corrected error in typings definitions.
## [2.3.6] - 2022-05-13
- Implemented new utils get option kind function.
## [2.3.5] - 2022-05-12
- Implemented new get option strike price from symbol function in utils.
## [2.3.4] - 2022-05-12
- Removed unnecessary position options implementation.
## [2.3.3] - 2022-05-10
- Corrections in all exchanges _ws implementations.
## [2.3.2] - 2022-05-09
- Corrected error in fixer order books.
## [2.3.1] - 2022-05-06
- Corrected error in fixer implementation.
## [2.3.0] - 2022-05-05
- Changed websocket to improved implementation.
## [2.2.8] - 2022-04-20
- Changed populators implementation.
## [2.2.7] - 2022-04-20
- Changed utils typing definitions and kraken utils implementation.
## [2.2.6] - 2022-04-16
- Corrected error in okex utils.
## [2.2.5] - 2022-04-15
- Changed criteria for order-book-static.
## [2.2.4] - 2022-04-14
- Corrected error in get order book ws function.
## [2.2.3] - 2022-04-13
- Corrected errors in exchanges websockets implementations.
## [2.2.2] - 2022-04-13
- Implemented get trades websocket functionality.
## [2.2.1] - 2022-04-12
- Corrected errors in _ws.js implementations.
## [2.2.0] - 2022-04-11
- Made relevant changes in websockets implementations.
## [2.1.4] - 2022-04-08
- Removed unnecessary fQuantity variable.
## [2.1.3] - 2022-04-07
- Changed code to save candle several times in cron populator.
## [2.1.2] - 2022-04-07
- Improved error handling in populator implementation.
## [2.1.1] - 2022-04-07
- Corrected minor errors in shared classes.
## [2.1.0] - 2022-04-06
- Changed ws function params to new typing definitions.
## [2.0.4] - 2022-04-06
- Corrections of only required module settings in exchanges.
## [2.0.3] - 2022-04-06
- Corrected error in bitmex getCandles function.
## [2.0.2] - 2022-04-06
- Corrected error when loading modules.
## [2.0.1] - 2022-04-06
- Corrected error when loading modules.
- Corrected error in bybit implementation.
## [2.0.0] - 2022-04-06
- Important general updates to project main implementation. 
- Changed to modular functionality aproach for each exchange.
## [1.6.0] - 2022-04-04
- Made general improvements and error corrections.
## [1.5.9] - 2022-03-30
- Removed kraken-futures update functionality.
## [1.5.8] - 2022-03-30
- Made corrections to fixer implementation.
## [1.5.7] - 2022-03-18
- Added event handler to on message in okex websocket.
## [1.5.6] - 2022-03-17
- Updated exchanges websockets events with new information.
## [1.5.5] - 2022-03-16
- Corrected error handling in fixer implementation.
## [1.5.4] - 2022-03-15
- Corrected errors in websocket implementation.
## [1.5.3] - 2022-03-14
- Added logs and removed connection event handler from order book server.
## [1.5.2] - 2022-03-14
- Corrected rest error handlers in okex.
## [1.5.1] - 2022-03-10
- Changed deribit api requests limits.
## [1.5.0] - 2022-03-06
- Implemented fixer functionality.
## [1.4.4] - 2022-03-05
- Changed ping/pong events frequency in websockets.
## [1.4.3] - 2022-03-05
- Added default logs to websocket events and removed unnecessary functionality.
- Corrected close functionality for websockets events.
## [1.4.2] - 2022-03-04
- Corrected error in utils functions.
## [1.4.1] - 2022-03-03
- Corrected error in get pnl function.
## [1.4.0] - 2022-03-01
- Implemented bitstamp rest candles function.
## [1.3.2] - 2022-02-25
- Updated versions of dependencies.
## [1.3.1] - 2022-02-24
- Changed rest request implementation.
## [1.3.0] - 2022-02-24
- Changed to a npm project scoped name.
## [1.2.6] - 2022-02-07
- Corrected error in utils implementation.
## [1.2.5] - 2022-02-07
- Changed ws implementation for exchanges.
## [1.2.4] - 2022-02-07
- Corrected error in utils pnl calculation.
## [1.2.3] - 2022-02-06
- Corrected error in binance implementation.
- Added order book connection verification code.
## [1.2.2] - 2022-02-04
- Added balance precision setting.
## [1.2.1] - 2022-02-04
- Added new utils function.
## [1.2.0] - 2022-02-03
- Changed general implementation and consumption of exchanges apis.
## [1.1.2] - 2022-01-13
- Changed typings declaration structure.
## [1.1.1] - 2022-01-12
- Corrected error in exports declaration in typings.
## [1.1.0] - 2022-01-12
- Changed main export exchanges module.
## [1.0.4] - 2021-12-26
- Added missing imports to comments.
## [1.0.3] - 2021-12-25
- Changed typings project structure.
## [1.0.2] - 2021-12-25
- Changed typings project structure.
## [1.0.1] - 2021-12-25
- Changed typings project structure.
