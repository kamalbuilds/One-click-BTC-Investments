"use client"

import React, { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowDown } from "lucide-react"
import { toast } from "react-toastify"
import {
  getContract,
  prepareContractCall,
  sendBatchTransaction,
  sendTransaction,
  toWei,
} from "thirdweb"
import { sepolia } from "thirdweb/chains"
import { useActiveAccount, useSendBatchTransaction } from "thirdweb/react"

import { BASE_URL } from "@/config/address"
import { client } from "@/config/wallet"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import Spinner from "@/components/Spinner"
import CrossChainDeposit from "@/components/deposit/CrossChainDeposit"
import { useBasket } from "@/context/BasketContext"
import { v4 as uuidv4 } from 'uuid';
import { RunesPriceList } from "@/config/price.config"
import { GatewayQuoteParams, GatewaySDK } from "@gobob/bob-sdk"
import { useSendTransaction, useSignMessage, useWaitForTransactionReceipt } from '@gobob/sats-wagmi'
import { TBTCService } from '@/services/tbtc'
import TBTCBridge from "@/components/TBTCBridge"
import { useAccount } from "@gobob/sats-wagmi"

type Investment = {
  percentage: number
  contractAddress: string
  amount?: number
}

type Investments = {
  [btsId: string]: Investment
}

const StrategyPage = ({ strategy, bts }) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { id } = useParams()
  console.log("Router", router);
  console.log("searchParams", searchParams);
  console.log("id", id);
  const { connector } = useAccount();
  const gatewaySDK = new GatewaySDK('bob-sepolia');

  const activeAccount = useActiveAccount()
  const connectedAddress = activeAccount?.address

  const { basketData, setBasketData } = useBasket();

  const [isLoading, setIsLoading] = useState<boolean>(true)

  const createBaskets = (data) => {
    const baskets = [];
    const noOfRunesInObject = 4
    for (let i = 0; i < data.length; i += noOfRunesInObject) {

      const basketId = Math.floor(i / noOfRunesInObject) + 1
      const basket = {
        id: basketId,
        name: `Basket ${Math.floor(i / noOfRunesInObject) + 1}`,
        runes: data.slice(i, i + noOfRunesInObject)
      };
      baskets.push(basket);
    }
    console.log("Baskets >>>", baskets)
    setIsLoading(false);
    setBasketData(baskets)
  }

  const fetchRunesList = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('https://open-api.unisat.io/v1/indexer/runes/info-list?start=0&limit=10', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_UNISAT_API_KEY}`
        }
      })
      const response = await res.json()

      console.log("response", response)

      const { detail } = response.data

      // Add prices to each rune
      detail.forEach(rune => {
        const priceInfo = RunesPriceList.find(price => price.name === rune.spacedRune);
        if (priceInfo) {
          rune.priceinusd = priceInfo.priceinusd;
          rune.sats = priceInfo.sats;
        }
      });

      createBaskets(detail)

    } catch (error) {
      setIsLoading(false);
      console.error("Error fetching BTS data:", error)
    }
  }

  useEffect(() => {
    fetchRunesList();
  }, [])


  const basketRunesData = useMemo(() => {
    const currentBasket = basketData.find((basket) => basket.id == id)
    return currentBasket
  }, [basketData, id])



  console.log("basketRunesData", basketRunesData);

  const [investAmount, setInvestAmount] = useState<string>("")
  const [contributions, setContributions] = useState({});

  const handleInvestmentChange = (rune: any, value: number) => {
    console.log("rune", rune, value);

    const newContributions = {
      ...contributions,
      [rune.runeid]: {
        percentage: value,
        amount: ((parseFloat(investAmount) || 0) * value) / 100,
        rune: rune
      }
    };

    const total = Object.values(newContributions).reduce((acc, curr) => acc + curr.percentage, 0);
    if (total <= 100) {
      setContributions(newContributions);
    } else {
      console.warn("Total percentage cannot exceed 100%");
    }

  }

  console.log("contributions", contributions);


  const handleInvest = async () => {

    if(selectedAction === "Cross-Chain Invest"){
      setBridgeDialogOpen(true)
    }
  }
  
  const handleBridgeSelect = async (bridgeType: "BOB" | "tBTC") => {
    
    setBridgeDialogOpen(false)
    setSelectedBridge(bridgeType)
    
    if (bridgeType === "BOB") {
      try {
        const res = await fetch('/api/swapBob', {
          method: 'POST',
          body: JSON.stringify({ 
            address: connectedAddress,
            amount: investAmount 
          })
        })
        
        const { data: { psbtBase64, uuid } } = await res.json()
        const bitcoinTxHex = await connector?.signAllInputs(psbtBase64!);
        console.log("Hex >>",bitcoinTxHex);
        const tx = await gatewaySDK.finalizeOrder(uuid, bitcoinTxHex!);
        console.log("Tx success",tx);

      } catch (error) {
        console.error("BOB Bridge error:", error)
        toast.error("Failed to bridge using BOB Gateway")
      }
    } else {
      <TBTCBridge />
    }
  }

  // const { mutate: sendBatch, data: transactionResult } =
  //   useSendBatchTransaction()

  // const handleInvest = async () => {
  //   console.log("Invest amount", investAmount, activeAccount)

  //   if (!investAmount) return
  //   if (!activeAccount) return
  //   const totalAmount = parseFloat(investAmount)

  //   const actualInvestments = Object.entries(investments).reduce(
  //     (acc, [btsId, investment]) => {
  //       const percentage = investment.percentage
  //       const investmentAmount = (totalAmount * percentage) / 100
  //       acc[btsId] = {
  //         ...investment,
  //         amount: investmentAmount,
  //       }
  //       return acc
  //     },
  //     {} as Record<string, Investment>
  //   )

  //   for (const [btsId, investment] of Object.entries(actualInvestments)) {
  //     contribute(investment)
  //   }
  // }

  // const activeAccount = useActiveAccount()
  // const [loading, setLoading] = useState(false)

  // const contribute = async (actualInvestments: Investment) => {
  //   if (actualInvestments && activeAccount) {
  //     setLoading(true)
  //     const contract = getContract({
  //       address: actualInvestments.contractAddress,
  //       chain: sepolia,
  //       client: client,
  //     })

  //     const amount: number = actualInvestments.amount!

  //     const transaction = prepareContractCall({
  //       contract,
  //       method: "function contribute(uint256 _slippage) external payable",
  //       params: [BigInt(20)],
  //       value: toWei(amount.toString()),
  //     })

  //     try {
  //       const { transactionHash } = await sendTransaction({
  //         account: activeAccount,
  //         transaction,
  //       })
  //       setLoading(false)

  //       console.log("transactionHash", transactionHash)
  //     } catch (error: any) {
  //       setLoading(false)
  //       console.log("Error ", error)
  //       toast.error("Error in transaction", error.message)
  //     }
  //   }
  // }

  const [selectedAction, setSelectedAction] = useState<string>("")
  // const [isDialogOpen, setIsDialogOpen] = useState(false)

  console.log("selecteed action", selectedAction)

  const { data: hash, error, isPending, sendTransaction } = useSendTransaction()
  const { signMessage } = useSignMessage()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = 
    useWaitForTransactionReceipt({ hash })

  const [isBridgeDialogOpen, setBridgeDialogOpen] = useState(false)
  const [selectedBridge, setSelectedBridge] = useState<"BOB" | "tBTC" | null>(null)


  return (
    <div>
      {isLoading ? (
        <div className="flex min-h-screen items-center justify-center"><Spinner /></div>
      ) : (
        <>
          <div>
            <div className="my-12 ml-12">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">
                {basketRunesData.name}
              </h1>

              <p className="text-muted-foreground max-w-[700px] text-lg">
                Set the percentage you want to contribute to
              </p>
            </div>
            <div>
              <div className="mb-4 ml-12 flex flex-col justify-start gap-1.5">
                <div className="flex flex-col gap-4">
                  <Label
                    htmlFor="Funds"
                    className="text-muted-foreground max-w-[700px] text-lg"
                  >
                    Enter Amount
                  </Label>
                  <Input
                    id="Funds"
                    placeholder="Enter Amount to invest"
                    type="text"
                    value={investAmount}
                    onChange={(e) => {
                      const value = e.target.value
                      setInvestAmount(value)
                    }}
                    className="w-80"
                    min="0"
                    step="any"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="mb-4 w-80">
                    <div className="text-muted-foreground flex flex-row items-center justify-between border p-2 px-3">
                      {selectedAction == "" ? "Select Action" : selectedAction}
                      <ArrowDown size={20} />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-80">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setSelectedAction("Invest")}
                    >
                      Invest
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setSelectedAction("Cross-Chain Invest")}
                    >
                      Cross-Chain Invest
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <Table>
                  <TableCaption>Customise your contributions.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Rune Name</TableHead>
                      <TableHead>Supply</TableHead>
                      <TableHead>Holders</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead className="w-[350px]">Set Contribution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {basketRunesData &&
                      basketRunesData.runes.map((rune) => (
                        <TableRow key={rune.runeid}>
                          <TableCell className="font-medium">
                            <div>
                              {rune.symbol}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <p className="text-lg font-medium leading-none">
                                {rune.rune}
                              </p>
                              <p className="text-muted-foreground text-sm">
                                {rune.spacedRune}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="capitalize">{Number(rune.supply).toLocaleString()}</p>
                          </TableCell>
                          <TableCell>
                            <p className="">{rune.holders.toLocaleString()}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <p className="text-lg font-medium leading-none">
                                {rune.sats} sats
                              </p>
                              <p className="text-muted-foreground text-sm">
                                ${rune.priceinusd}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-2">
                              <Slider
                                onValueChange={(value) => {
                                  handleInvestmentChange(rune, value[0])
                                }}
                                max={100}
                                value={[contributions[rune.runeid]?.percentage || 0]}
                                className="w-[250px]"
                              />
                              <p>{contributions[rune.runeid]?.percentage} %</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <Button
              size="lg"
              className="w-md cursor-pointer"
              onClick={handleInvest}
            >
              Invest
            </Button>
          </div>
        </>
      )}


      {/* {!isLoading && selectedAction != "" && (
        <div className="flex flex-col items-center justify-center justify-self-center pt-4">
          <div>
            {selectedAction === "Invest" && (
              <Button
                size="lg"
                className="w-md cursor-pointer"
                disabled={loading}
                onClick={handleInvest}
              >
                Invest
              </Button>
            )}
          </div>

          <div>
            {selectedAction === "Cross-Chain Invest" && (
              <Link href="/bridge">
                <Button
                  size="lg"
                  className="w-md"
                  disabled={loading}
                  onClick={handleInvest}
                >
                  Cross-Chain Invest
                </Button>
              </Link>
            )}
          </div>

          <div>
            {selectedAction === "Pay With Circle" && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setIsDialogOpen(true)}>
                    Pay With Circle
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Pay With Circle</DialogTitle>
                    <DialogDescription>
                      Please enter the details for initiating payment.
                    </DialogDescription>
                  </DialogHeader>
                  <CrossChainDeposit investAmount={investAmount} />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      )} */}


      <BridgeSelectionDialog
        isOpen={isBridgeDialogOpen}
        onClose={() => setBridgeDialogOpen(false)}
        onSelect={handleBridgeSelect}
      />
      
      {selectedBridge && (
        <div className="mt-4">
          {hash && <div className="text-sm text-gray-500">Transaction Hash: {hash}</div>}
          {isConfirming && <div className="text-sm text-blue-500">Confirming transaction...</div>}
          {isConfirmed && <div className="text-sm text-green-500">Transaction confirmed!</div>}
          {error && <div className="text-sm text-red-500">Error: {error.message}</div>}
        </div>
      )}
    </div>
  )
}

const BridgeSelectionDialog = ({ 
  isOpen, 
  onClose, 
  onSelect 
}: { 
  isOpen: boolean
  onClose: () => void
  onSelect: (bridge: "BOB" | "tBTC") => void 
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select CrossChain Investment Method</DialogTitle>
          <DialogDescription>
            Choose how you want to invest your Bitcoin
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Button onClick={() => onSelect("BOB")}>
            BOB Gateway
          </Button>
          <Button onClick={() => onSelect("tBTC")}>
            tBTC Bridge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default StrategyPage