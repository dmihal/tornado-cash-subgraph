import { BigInt, Address, ethereum } from "@graphprotocol/graph-ts"
import { TornadoPool as TornadoPoolContract, Deposit, Withdrawal } from "../generated/ETH1/TornadoPool"
import { ERC20 } from "../generated/ETH1/ERC20"
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
  return tornado
}

export function handleDeposit(event: Deposit): void {
  let pool = getPool(event.address)

  pool.setSize += BigInt.fromI32(1)
  pool.poolSize = pool.setSize.toBigDecimal() * pool.denomination
  pool.totalDeposits += BigInt.fromI32(1)

  pool.save()
}

export function handleWithdrawal(event: Withdrawal): void {
  let pool = getPool(event.address)

  pool.setSize -= BigInt.fromI32(1)
  pool.poolSize = pool.setSize.toBigDecimal() * pool.denomination
  pool.totalVolume += pool.denomination

  if (event.params.fee > BigInt.fromI32(0)) {
    let assetAddressStr = pool.asset.toHex()
    let decimals = assetAddressStr == zero ? 18 : ERC20.bind(Address.fromString(assetAddressStr)).decimals()
    let baseUnit = BigInt.fromI32(10).pow(decimals as u8).toBigDecimal()
    pool.totalFees += event.params.fee.divDecimal(baseUnit)
  }

  pool.save()
}
