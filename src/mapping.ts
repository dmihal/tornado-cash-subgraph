import { BigDecimal, BigInt, Bytes, Address, ethereum } from "@graphprotocol/graph-ts"
import { TornadoPool as TornadoPoolContract, Deposit, Withdrawal } from "../generated/ETH1/TornadoPool"
import { ERC20 } from "../generated/ETH1/ERC20"
import { Medianizer } from "../generated/ETH1/Medianizer"
import { Tornado, TornadoPool } from "../generated/schema"

let zero = '0x0000000000000000000000000000000000000000'

function addressOrZero(result: ethereum.CallResult<Address>): Address {
  if (result.reverted) {
    return Address.fromString(zero)
  } else {
    return result.value
  }
}

function getPool(address: Address): TornadoPool {
  let pool = TornadoPool.load(address.toHex())
  if (!pool) {
    let poolContract = TornadoPoolContract.bind(address)
    pool = new TornadoPool(address.toHex())

    let tokenResult = poolContract.try_token()
    pool.asset = addressOrZero(tokenResult)

    let decimals = tokenResult.reverted ? 18 : ERC20.bind(tokenResult.value).decimals()
    let baseUnit = BigInt.fromI32(10).pow(decimals as u8).toBigDecimal()
    pool.denomination = poolContract.denomination().divDecimal(baseUnit)

    let tokenSymbol = tokenResult.reverted ? 'ETH' : ERC20.bind(tokenResult.value).symbol()
    pool.name = tokenSymbol.concat(' ').concat(pool.denomination.toString())

    pool.setSize = BigInt.fromI32(0)
    pool.poolSize = BigInt.fromI32(0).toBigDecimal()
    pool.totalDeposits = BigInt.fromI32(0)
    pool.totalWithdrawals = BigInt.fromI32(0)
    pool.totalVolume = BigInt.fromI32(0).toBigDecimal()
    pool.totalFees = BigInt.fromI32(0).toBigDecimal()
    pool.totalVolumeUSD = BigInt.fromI32(0).toBigDecimal()
    pool.totalFeesUSD = BigInt.fromI32(0).toBigDecimal()
  }
  return pool!
}

function getTornado(): Tornado {
  let tornado = Tornado.load('1')
  if (!tornado) {
    tornado = new Tornado('1')
    tornado.totalVolumeUSD = BigInt.fromI32(0).toBigDecimal()
    tornado.totalFeesUSD = BigInt.fromI32(0).toBigDecimal()
  }
  return tornado!
}

function getETHPrice(): BigDecimal {
  let medianizer = Medianizer.bind(Address.fromString('0x729D19f657BD0614b4985Cf1D82531c67569197B'))
  let oraclePrice = BigInt.fromUnsignedBytes(medianizer.peek().value0.reverse() as Bytes)
  return oraclePrice.divDecimal(BigInt.fromI32(10).pow(18).toBigDecimal())
}

export function handleDeposit(event: Deposit): void {
  let pool = getPool(event.address)
  let tornado = getTornado()

  pool.setSize += BigInt.fromI32(1)
  pool.poolSize = pool.setSize.toBigDecimal() * pool.denomination
  pool.totalDeposits += BigInt.fromI32(1)
  tornado.totalDeposits += BigInt.fromI32(1)

  pool.save()
  tornado.save()
}

export function handleWithdrawal(event: Withdrawal): void {
  let pool = getPool(event.address)
  let tornado = getTornado()

  tornado.totalWithdrawals += BigInt.fromI32(1)
  pool.totalWithdrawals += BigInt.fromI32(1)
  pool.setSize -= BigInt.fromI32(1)
  pool.poolSize = pool.setSize.toBigDecimal() * pool.denomination
  pool.totalVolume += pool.denomination

  let assetAddressStr = pool.asset.toHex()
  // Assume a price of $1 for all stablecoins
  let price = assetAddressStr == zero ? getETHPrice() : BigInt.fromI32(1).toBigDecimal()

  tornado.totalVolumeUSD += pool.denomination * price
  pool.totalVolumeUSD += pool.denomination * price

  if (event.params.fee > BigInt.fromI32(0)) {
    let decimals = assetAddressStr == zero ? 18 : ERC20.bind(Address.fromString(assetAddressStr)).decimals()
    let baseUnit = BigInt.fromI32(10).pow(decimals as u8).toBigDecimal()
    let fee = event.params.fee.divDecimal(baseUnit)
    pool.totalFees += fee

    pool.totalFeesUSD += fee * price
    tornado.totalFeesUSD += fee * price
  }

  tornado.save()
  pool.save()
}
