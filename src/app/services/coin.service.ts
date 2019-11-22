import { Injectable } from '@angular/core';
import { MyCoin } from '../models/mycoin';
import * as BIP32 from 'node_modules/bip32';
import * as Btc from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import * as hdkey from 'ethereumjs-wallet/hdkey';
import { Address } from '../models/address';
import {coin_list} from '../config/coins';
import {ApiService} from './api.service';
import * as wif from 'wif';
import { Web3Service } from './web3.service';
import {Signature} from '../interfaces/kanban.interface';
import { UtilService } from './util.service';
import * as abi from 'web3-eth-abi';
import { environment } from '../../environments/environment';
@Injectable()
export class CoinService {
    constructor(private apiService: ApiService, private web3Serv: Web3Service, private utilServ: UtilService) {
    } 

    getCoinTypeIdByName(name: string) {
        for (let i = 0; i < coin_list.length; i++) {
            const coin = coin_list[i];
            if (coin.name === name) {
                return coin.id;
            }
        }
        return -1;
    }

    getCoinNameByTypeId(id: number) {
        return coin_list[id].name;
    }
    initToken(type: string, name: string, decimals: number, address: string, baseCoin: MyCoin) {
        const coin = new MyCoin(name);
        coin.tokenType = type;
        coin.decimals = decimals;
        coin.contractAddr = address;
        coin.coinType = baseCoin.coinType;
        coin.baseCoin = baseCoin;
        //const addr = new Address(baseCoin.coinType, baseCoin.receiveAdds[0].address, 0);
        //coin.receiveAdds.push(addr);
        return coin;
    }

    initMyCoins(seed: Buffer): MyCoin[] {
        const myCoins = new Array();

        const fabCoin = new MyCoin('FAB');
        this.fillUpAddress(fabCoin, seed, 1, 0);

        const exgCoin = this.initToken('FAB', 'EXG', 18, environment.addresses.smartContract.EXG, fabCoin);
        this.fillUpAddress(exgCoin, seed, 1, 0);

        myCoins.push(exgCoin);
        myCoins.push(fabCoin);

        const btcCoin = new MyCoin('BTC');
        this.fillUpAddress(btcCoin, seed, 100, 100);
        myCoins.push(btcCoin);  

        const ethCoin = new MyCoin('ETH');
        this.fillUpAddress(ethCoin, seed, 1, 0);
        myCoins.push(ethCoin); 

        /*
        coin = new MyCoin('USDT');
        this.fillUpAddress(coin, seed, 1, 0);
        myCoins.push(coin);  
        */
        const usdtCoin = this.initToken('ETH', 'USDT', 6, environment.addresses.smartContract.USDT, ethCoin);     
        this.fillUpAddress(usdtCoin, seed, 1, 0);
        myCoins.push(usdtCoin);      
             
        return myCoins;
    }

    initExCoin(seed: Buffer): MyCoin {
        const coin = new MyCoin('EX');
        this.fillUpAddress(coin, seed, 1, 0);   
        return coin;     
    }

    getOfficialAddress(myCoin: MyCoin) {
        const addresses = environment.addresses.exchangilyOfficial;
        for (let i = 0; i < addresses.length; i++) {
            if (addresses[i].name === myCoin.name) {
                return addresses[i].address;
            }
        }
        return '';
    }


    async depositFab(scarContractAddress: string, seed: any, mycoin: MyCoin, amount: number) {
        // sendTokens in https://github.com/ankitfa/Fab_sc_test1/blob/master/app/walletManager.js
        const gasLimit = 800000;
        const gasPrice = 40;

        console.log('scarContractAddress=', scarContractAddress);
        const totalAmount = gasLimit * gasPrice / 1e8;
        // let cFee = 3000 / 1e8 // fee for the transaction
    
        let totalFee = totalAmount;
    
        // -----------------------------------------------------------------------
        

        const addDepositFunc = {
            "constant": false,
            "inputs": [],
            "name": "addDeposit",
            "outputs": [
            {
            "name": "",
            "type": "address"
            }
            ],
            "payable": true,
            "stateMutability": "payable",
            "type": "function"
            };
        
        let fxnCallHex = abi.encodeFunctionCall(addDepositFunc, []);
        fxnCallHex = this.utilServ.stripHexPrefix(fxnCallHex);
        
        console.log('fxnCallHexfxnCallHexfxnCallHexfxnCallHexfxnCallHex=', fxnCallHex);
        const contract = Btc.script.compile([
            84,
            this.utilServ.number2Buffer(gasLimit),
            this.utilServ.number2Buffer(gasPrice),
            this.utilServ.hex2Buffer(fxnCallHex),
            this.utilServ.hex2Buffer(scarContractAddress),
            194
        ]);
        
        console.log('contract=', contract);
        const contractSize = contract.toJSON.toString().length;

        console.log('contractSize=' + contractSize);
        totalFee += this.utilServ.convertLiuToFabcoin(contractSize * 10);
        
        console.log('totalFee=' + totalFee);
        const res = await this.getFabTransactionHex(seed, mycoin, contract, amount, totalFee, 14);
        
        const txHex = res.txHex;
        let errMsg = res.errMsg;
        let txHash = '';
        if (!errMsg) {
            const res2 = await this.apiService.postFabTx(txHex);
            txHash = res2.txHash;
            errMsg = res2.errMsg;
        }
        return {txHash: txHash, errMsg: errMsg};
    }

    async getBlanceByAddress (tokenType: string, contractAddr: string, name: string, addr: string, decimals: number) {
        let balance = 0;
        let lockbalance = 0;
        if (name === 'BTC') {
            const balanceObj = await this.apiService.getBtcBalance(addr);
            balance = balanceObj.balance / 1e8;
            lockbalance = balanceObj.lockbalance / 1e8;
        } else 
        if (name === 'ETH') {
            const balanceObj = await this.apiService.getEthBalance(addr);
            balance = balanceObj.balance / 1e18;
            lockbalance = balanceObj.lockbalance / 1e18;
        } else 
        if (name === 'FAB') {
            const balanceObj = await this.apiService.getFabBalance(addr);
            balance = balanceObj.balance / 1e8;
            lockbalance = balanceObj.lockbalance / 1e8;
        } else
        if (tokenType === 'ETH') {
            if (!decimals) {
                decimals = 18;
            }
            const balanceObj = await this.apiService.getEthTokenBalance(name, contractAddr, addr);
            console.log('balanceObj=', balanceObj);
            balance = balanceObj.balance / Math.pow(10, decimals);
            lockbalance = balanceObj.lockbalance / Math.pow(10, decimals);
        } else
        if (tokenType === 'FAB') {
            const balanceObj = await this.apiService.getFabTokenBalance(name, contractAddr, addr);
            balance = balanceObj.balance / Math.pow(10, decimals);
            lockbalance = balanceObj.lockbalance / Math.pow(10, decimals);        
        }
        return {balance, lockbalance};
    }
    async getBalance(myCoin: MyCoin) {
        let balance;
        let totalBalance = 0;
        let totalLockBalance = 0;
        const coinName = myCoin.name;
        const tokenType = myCoin.tokenType;
        const contractAddr = myCoin.contractAddr;

        let receiveAddsLen = myCoin.receiveAdds.length;
        let changeAddsLen = myCoin.changeAdds.length;

        if (coinName === 'BTC') {
            receiveAddsLen = (receiveAddsLen > 3) ? 3 : receiveAddsLen;
            changeAddsLen = (changeAddsLen > 3) ? 3 : changeAddsLen;

        }
        if (coinName === 'FAB') {
            receiveAddsLen = (receiveAddsLen > 1) ? 1 : receiveAddsLen;
            changeAddsLen = (changeAddsLen > 1) ? 1 : changeAddsLen;
        }
        for (let i = 0; i < receiveAddsLen; i ++) {
            const addr = myCoin.receiveAdds[i].address;
            const decimals = myCoin.decimals;

            balance = await this.getBlanceByAddress(tokenType, contractAddr, coinName, addr, decimals);
            myCoin.receiveAdds[i].balance = balance.balance;
            totalBalance += balance.balance;
            myCoin.receiveAdds[i].lockedBalance = balance.lockbalance;
            totalLockBalance += balance.lockbalance;
        }

        for (let i = 0; i < changeAddsLen; i ++) {
            const addr = myCoin.changeAdds[i].address;
            const decimals = myCoin.decimals;
            balance = await this.getBlanceByAddress(tokenType, contractAddr, coinName, addr, decimals);
            myCoin.changeAdds[i].balance = balance.balance;
            totalBalance += balance.balance;
            myCoin.receiveAdds[i].lockedBalance = balance.lockbalance;
            totalLockBalance += balance.lockbalance;
        }

        return {balance: totalBalance, lockbalance: totalLockBalance};
    }

    getExPrivateKey(excoin: MyCoin, seed: Buffer) {
        const root = hdkey.fromMasterSeed(seed);
        const address1 = excoin.receiveAdds[0];
        const currentIndex = address1.index;        
        const wallet = root.derivePath( "m/44'/" + excoin.coinType + "'/0/" + currentIndex ).getWallet();
        const privateKey = wallet.getPrivateKey();  
        console.log('address is for getExPrivateKey:' + excoin.receiveAdds[0].address);
        return privateKey;
    }

    getKeyPairs(coin: MyCoin, seed: Buffer, chain: number, index: number) {
        const name = coin.name;
        
        const tokenType = coin.tokenType;
        let addr = '';
        let priKey = '';
        let pubKey = '';
        let priKeyHex = '';
        let priKeyDisp = '';
        let buffer = Buffer.alloc(32);
        const path = "m/44'/" + coin.coinType + "'/0'/" + chain + "/" + index;

        if (name === 'BTC' || name === 'FAB') {
            const root = BIP32.fromSeed(seed, environment.chains.BTC.network);
            console.log('root.base58=');
            console.log(root.toBase58());
            // const childNode = root.derivePath( path );

            const childNode1 = root.deriveHardened(44);
            const childNode2 = childNode1.deriveHardened(coin.coinType);
            const childNode3 = childNode2.deriveHardened(0);
            const childNode4 = childNode3.derive(0);
            const childNode = childNode4.derive(0);
            console.log('path=' + path);

            console.log('childNode1.base58=');
            console.log(childNode1.toBase58());  

            console.log('childNode2.base58=');
            console.log(childNode2.toBase58());  
            
            console.log('childNode3.base58=');
            console.log(childNode3.toBase58());  

            console.log('childNode4.base58=');
            console.log(childNode4.toBase58());  

            console.log('childNode.base58=');
            console.log(childNode.toBase58());            
            const { address } = Btc.payments.p2pkh({
                pubkey: childNode.publicKey,
                network: environment.chains.BTC.network
            });
            console.log('address=');
            console.log(address);
            addr = address;
            priKey = childNode.toWIF();
            pubKey = `0x${childNode.publicKey.toString('hex')}`;
            buffer = wif.decode(priKey); 
            priKeyDisp = priKey;              
        } else 
        if (name === 'ETH' || tokenType === 'ETH') {

            const root = hdkey.fromMasterSeed(seed);
            const childNode = root.derivePath( path );

            const wallet = childNode.getWallet();
            const address = `0x${wallet.getAddress().toString('hex')}`;
            addr = address;
            buffer = wallet.getPrivateKey();  
            priKey = wallet.getPrivateKey();  
            priKeyDisp = buffer.toString('hex');

        } else  
        if (name === 'EX' || tokenType === 'FAB') { 
            const root = BIP32.fromSeed(seed, environment.chains.BTC.network);

            const childNode = root.derivePath( path );    
            
            const originalPrivateKey = childNode.privateKey;
            priKeyHex = originalPrivateKey.toString('hex');
            priKey = childNode.toWIF(); 
            priKeyDisp = priKey;
            buffer = wif.decode(priKey);  

            const publicKey = childNode.publicKey;
            const publicKeyString = `0x${publicKey.toString('hex')}`;
            addr = this.utilServ.toKanbanAddress(publicKeyString);

            console.log('here we go');
            console.log('name=' + name);
            console.log('priKeyHex=' + priKeyHex);
            console.log('publicKeyString=' + publicKeyString);
            console.log('address=' + addr);
            /*
            const privateKeyBuffer = wif.decode(priv.ateKey); Balance
            const wallet = Wallet.fromPrivateKey(privateKeyBufBalance
            const address = `0x${wallet.getAddress().toString(Balance
            addr = address; 
            priKey = wallet.getPrivateKey();    
            buffer = wallet.getPrivateKey();   
            */  
              
        }

        const keyPairs = {
            address: addr,
            privateKey: priKey,
            privateKeyHex: priKeyHex,
            privateKeyBuffer: buffer,
            privateKeyDisplay: priKeyDisp,
            publicKey: pubKey,
            name: name,
            tokenType: tokenType
        };        

        return keyPairs;
    }

    signedMessage(originalMessage: string , keyPair: any) {
        let signature: Signature;
        const name = keyPair.name;
        const tokenType = keyPair.tokenType;

        if (name === 'ETH' || tokenType === 'ETH') {
            signature = this.web3Serv.signMessageWithPrivateKey(originalMessage, keyPair) as Signature;
            console.log('signature in signed is ');
            console.log(signature);
        } else 
        if (name === 'FAB' || name === 'BTC' || tokenType === 'FAB') {
            // signature = this.web3Serv.signMessageWithPrivateKey(originalMessage, keyPair) as Signature;
            const signBuffer = bitcoinMessage.sign(originalMessage, keyPair.privateKeyBuffer.privateKey, 
                keyPair.privateKeyBuffer.compressed);
            const signHex = `${signBuffer.toString('hex')}`;
            const v = `0x${signBuffer.slice(0, 1).toString('hex')}`;
            const r = `0x${signBuffer.slice(1, 33).toString('hex')}`;
            const s = `0x${signBuffer.slice(33, 65).toString('hex')}`;

            signature = {r: r, s: s, v: v};
        }
        return signature;
    }

    formCoinType(v: string, coinType: number) {
        let retString = v;
        retString = retString + this.utilServ.fixedLengh(coinType, 32 - v.length);
        return retString;
    }

    async getFabTransactionHex(seed: any, mycoin: MyCoin, to: any, amount: number, extraTransactionFee: number, satoshisPerBytes: number) {
        let index = 0;
        let balance = 0;
        let finished = false;
        let address = '';
        let totalInput = 0;
        
        const bytesPerInput = 148;
        const feePerInput = bytesPerInput * satoshisPerBytes;
        const receiveAddsIndexArr = [];
        const changeAddsIndexArr = [];

        const totalAmount = amount + extraTransactionFee;
        let amountNum = totalAmount * Math.pow(10, this.utilServ.getDecimal(mycoin));
        amountNum += (2 * 34 + 10);
        // const TestNet = Btc.networks.testnet;
        const network = environment.chains.BTC.network;

        const txb = new Btc.TransactionBuilder(network);
        
        let txHex = '';
        for (index = 0; index < mycoin.receiveAdds.length; index ++) {
            balance = mycoin.receiveAdds[index].balance;
            if (balance <= 0) {
                continue;
            }
            address = mycoin.receiveAdds[index].address;
            console.log('address in getFabTransactionHex=' + address);
            const fabUtxos = await this.apiService.getFabUtxos(address);
            if (fabUtxos && fabUtxos.length) {
                for (let i = 0; i < fabUtxos.length; i++) {
                    const utxo = fabUtxos[i];
                    const idx = utxo.idx;
                    const isLocked = await this.apiService.isFabTransactionLocked(utxo.txid, idx);
                    if (isLocked) {
                        continue;
                    }
                    txb.addInput(utxo.txid, utxo.idx);
                    console.log('input is');
                    console.log(utxo.txid, utxo.idx, utxo.value);
                    receiveAddsIndexArr.push(index);
                    totalInput += utxo.value;
                    console.log('totalInput here=', totalInput);
                    amountNum -= utxo.value;
                    amountNum += feePerInput;
                    if (amountNum <= 0) {
                        finished = true;
                        break;
                    }                 
                }    
            }
            if (finished) {
                break;
            }              
        }

        console.log('totalInput here 1=', totalInput);

        if (!finished) {
            for (index = 0; index < mycoin.changeAdds.length; index ++) {
                balance = mycoin.changeAdds[index].balance;
                if (balance <= 0) {
                    continue;
                }
                address = mycoin.changeAdds[index].address;
                
                const fabUtxos = await this.apiService.getFabUtxos(address);
                if (fabUtxos && fabUtxos.length) {
                    for (let i = 0; i < fabUtxos.length; i++) {
                        const utxo = fabUtxos[i];
                        const idx = utxo.idx;
                        const isLocked = await this.apiService.isFabTransactionLocked(utxo.txid, idx);
                        if (isLocked) {
                            continue;
                        }                    
                        txb.addInput(utxo.txid, utxo.idx);
                        console.log('input is');
                        console.log(utxo.txid, utxo.idx, utxo.value);
                        receiveAddsIndexArr.push(index);
                        totalInput += utxo.value;
                        console.log('totalInput here=', totalInput);
                        amountNum -= utxo.value;
                        amountNum += feePerInput;
                        if (amountNum <= 0) {
                            finished = true;
                            break;
                        }                 
                    }    
                }
                if (finished) {
                    break;
                }              
            }
        }
        console.log('totalInput here 2=', totalInput);
        if (!finished) {
            console.log('not enough fab coin to make the transaction.');
            return {txHex: '', errMsg: 'not enough fab coin to make the transaction.'};
        }


        const changeAddress = mycoin.receiveAdds[0];

        const transFee = (receiveAddsIndexArr.length + changeAddsIndexArr.length) * feePerInput + 2 * 34 + 10;

        const output1 = Math.round(totalInput
        - amount * Math.pow(10, this.utilServ.getDecimal(mycoin)) - extraTransactionFee * Math.pow(10, this.utilServ.getDecimal(mycoin))
        - transFee);
        const output2 = Math.round(amount * 1e8);    
        
        if (output1 < 0 || output2 < 0) {
            console.log('output1 or output2 should be greater than 0.');
            return {txHex: '', errMsg: 'output1 or output2 should be greater than 0.'};
        }
        console.log('amount=' + amount + ',totalInput=' + totalInput);
        console.log('defaultTransactionFee=' + extraTransactionFee);
        console.log('(receiveAddsIndexArr.length + changeAddsIndexArr.length) * feePerInput)=' 
        + (receiveAddsIndexArr.length + changeAddsIndexArr.length) * feePerInput);
        console.log('output1=' + output1 + ',output2=' + output2);
        txb.addOutput(changeAddress.address, output1);
        txb.addOutput(to, output2);

        for (index = 0; index < receiveAddsIndexArr.length; index ++) {
            const keyPair = this.getKeyPairs(mycoin, seed, 0, receiveAddsIndexArr[index]);
            console.log('keyPair.privateKey=' + keyPair.privateKey + ',keyPair.publicKey=' + keyPair.publicKey);
            console.log('receiveAddsIndexArr[index]=' + receiveAddsIndexArr[index] + ',address for keypair=' + keyPair.address);
            const alice = Btc.ECPair.fromWIF(keyPair.privateKey, network);
            txb.sign(index, alice);                
        }

        for (index = 0; index < changeAddsIndexArr.length; index ++) {
            const keyPair = this.getKeyPairs(mycoin, seed, 1, changeAddsIndexArr[index]);
            console.log('changeAddsIndexArr[index]=' + changeAddsIndexArr[index] + 'address for keypair=' + keyPair.address);
            const alice = Btc.ECPair.fromWIF(keyPair.privateKey, network);
            txb.sign(receiveAddsIndexArr.length + index, alice);                
        }            

        txHex = txb.build().toHex();
        return {txHex: txHex, errMsg: ''};
    }

    getOriginalMessage(coinType: number, txHash: string, amount: number, address: string) {
        /*
        const bufCoin =             const txb = new Btc.TransactionBuilder(TestNet);
            
            for (index = 0; index < mycoin.receiveAdds.length; index ++) {
                balance = mycoin.receiveAdds[index].balance;
                if (balance <= 0) {
                    continue;
                }
                address = mycoin.receiveAdds[index].address;

                const fabTransactions = await this.apiService.getFabTransaction(address);

                for (let i = 0; i < fabTransactions.result.length; i++) {
                    const utxos = fabTransactions.result[i].utxos;
    
                    for (let j = 0; j < utxos.length; j++) {
                        const utxo = utxos[j];
                        txb.addInput(utxo.txid, utxo.sequence);
                        receiveAddsIndexArr.push(index);
                        totalInput += utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                        amountNum -= utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                        if (amountNum <= 0) {
                            finished = true;
                          totalInput += utxo.value;  break;
                        }                    
                    }
                    if (finished) {
                        break;
                    }
                }    
                if (finished) {
                    break;
                }              
            }



            if (!finished) {
                for (index = 0; index < mycoin.changeAdds.length; index ++) {
                    balance = mycoin.changeAdds[index].balance;
                    if (balance <= 0) {
                        continue;
                    }
                    address = mycoin.changeAdds[index].address;
    getFabTransactionHex
    getFabTransactionHex
    getFabTransactionHex
    getFabTransactionHex

    getFabTransactionHex
    getFabTransactionHex
                        for (let j = 0; j < utxos.length; j++) {
                            const utxo = utxos[j];
                            txb.addInput(utxo.txid, utxo.sequence);
                            changeAddsIndexArr.push(index);
                            totalInput += utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                            amountNum -= utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                            if (amountNum <= 0) {
                                finished = true;
                                break;
                            }                    
                        }
                        if (finished) {
                            break;
                        }
                    }    
                    if (finished) {
                        break;getFabTransactionHex
                    }         getFabTransactionHex
                }
            }

            if (!finished) {
                console.log('not enough fund.');
                return '';
            }


            const changeAddress = mycoin.changeAdds[0];
            const output1 = Math.round(totalInput
            - amount * Math.pow(10, this.utilServ.getDecimal(mycoin)) - 3000 
            - (receiveAddsIndexArr.length + changeAddsIndexArr.length) * 300);
            const output2 = Math.round(amount * 1e8);         
            txb.addOutput(changeAddress.address, output1);
            txb.addOutput(toAddress, output2);

            for (index = 0; index < receiveAddsIndexArr.length; index ++) {
                const keyPair = this.getKeyPairs(mycoin, seed, 0, receiveAddsIndexArr[index]);
                const alice = Btc.ECPair.fromWIF(keyPair.privateKey, TestNet);
                txb.sign(index, alice);                
            }

            for (index = 0; index < changeAddsIndexArr.length; index ++) {
                const keyPair = this.getKeyPairs(mycoin, seed, 1, changeAddsIndexArr[index]);
                const alice = Btc.ECPair.fromWIF(keyPair.privateKey, TestNet);
                txb.sign(receiveAddsIndexArr.length + index, alice);                
            }            

            const txhex = txb.build().toHex();uffer.allocUnsafe(2initMyCoins);
        bufCoin.writeUIn            const txb = new Btc.TransactionBuilder(TestNet);
            
            for (index = 0; index < mycoin.receiveAdds.length; index ++) {
                balance = mycoin.receiveAdds[index].balance;
                if (balance <= 0) {
                    continue;
                }
                address = mycoin.receiveAdds[index].address;

                const fabTransactions = await this.apiService.getFabTransaction(address);

                for (let i = 0; i < fabTransactions.result.length; i++) {
                    const utxos = fabTransactions.result[i].utxos;
    
                    for (let j = 0; j < utxos.length; j++) {
                        const utxo = utxos[j];
                        txb.addInput(utxo.txid, utxo.sequence);
                        receiveAddsIndexArr.push(index);
                        totalInput += utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                        amountNum -= utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                        if (amountNum <= 0) {
                            finished = true;
                          totalInput += utxo.value;  break;
                        }                    
                    }
                    if (finished) {
                        break;
                    }
                }    
                if (finished) {
                    break;
                }              
            }



            if (!finished) {
                for (index = 0; index < mycoin.changeAdds.length; index ++) {
                    balance = mycoin.changeAdds[index].balance;
                    if (balance <= 0) {
                        continue;
                    }
                    address = mycoin.changeAdds[index].address;
    
                    const fabTransactions = await this.apiService.getFabTransaction(address);
    
                    for (let i = 0; i < fabTransactions.result.length; i++) {

                        const utxos = fabTransactions.result[i].utxos;
        
                        for (let j = 0; j < utxos.length; j++) {
                            const utxo = utxos[j];
                            txb.addInput(utxo.txid, utxo.sequence);
                            changeAddsIndexArr.push(index);
                            totalInput += utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                            amountNum -= utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                            if (amountNum <= 0) {
                                finished = true;
                                break;
                            }                    
                        }
                        if (finished) {
                            break;
                        }
                    }    
                    if (finished) {
                        break;
                    }              
                }
            }

            if (!finished) {
                console.log('not enough fund.');
                return '';
            }


            const changeAddress = mycoin.changeAdds[0];
            const output1 = Math.round(totalInput
            - amount * Math.pow(10, this.utilServ.getDecimal(mycoin)) - 3000 
            - (receiveAddsIndexArr.length + changeAddsIndexArr.length) * 300);
            const output2 = Math.round(amount * 1e8);         
            txb.addOutput(changeAddress.address, output1);
            txb.addOutput(toAddress, output2);

            for (index = 0; index < receiveAddsIndexArr.length; index ++) {
                const keyPair = this.getKeyPairs(mycoin, seed, 0, receiveAddsIndexArr[index]);
                const alice = Btc.ECPair.fromWIF(keyPair.privateKey, TestNet);
                txb.sign(index, alice);                
            }

            for (index = 0; index < changeAddsIndexArr.length; index ++) {
                const keyPair = this.getKeyPairs(mycoin, seed, 1, changeAddsIndexArr[index]);
                const alice = Btc.ECPair.fromWIF(keyPair.privateKey, TestNet);
                txb.sign(receiveAddsIndexArr.length + index, alice);                
            }            getFabTransactionHex

            const txhex = txb.build().toHex();16BE(coinType,0);  initMyCoins      
        const bufTxHash             const txb = new Btc.TransactionBuilder(TestNet);getFabTransactionHex
            
            for (index = 0; index < mycoin.receiveAdds.length; index ++) {
                balance = mycoin.receiveAdds[index].balance;
                if (balance <= 0) {
                    continue;
                }
                address = mycoin.receiveAdds[index].address;

                const fabTransactions = await this.apiService.getFabTransaction(address);

                for (let i = 0; i < fabTransactions.result.length; i++) {
                    const utxos = fabTransactions.result[i].utxos;
    
                    for (let j = 0; j < utxos.length; j++) {
                        const utxo = utxos[j];
                        txb.addInput(utxo.txid, utxo.sequence);
                        receiveAddsIndexArr.push(index);
                        totalInput += utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                        amountNum -= utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                        if (amountNum <= 0) {
                            finished = true;
                          totalInput += utxo.value;  break;
                        }                    
                    }
                    if (finished) {
                        break;
                    }
                }    
                if (finished) {
                    break;
                }              
            }



            if (!finished) {
                for (index = 0; index < mycoin.changeAdds.length; index ++) {
                    balance = mycoin.changeAdds[index].balance;
                    if (balance <= 0) {
                        continue;
                    }
                    address = mycoin.changeAdds[index].address;
    
                    const fabTransactions = await this.apiService.getFabTransaction(address);
    
                    for (let i = 0; i < fabTransactions.result.length; i++) {

                        const utxos = fabTransactions.result[i].utxos;
        
                        for (let j = 0; j < utxos.length; j++) {
                            const utxo = utxos[j];
                            txb.addInput(utxo.txid, utxo.sequence);
                            changeAddsIndexArr.push(index);
                            totalInput += utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                            amountNum -= utxo.value * Math.pow(10, this.utilServ.getDecimal(mycoin));
                            if (amountNum <= 0) {
                                finished = true;
                                break;
                            }                    
                        }
                        if (finished) {
                            break;
                        }
                    }    
                    if (finished) {
                        break;
                    }              
                }
            }

            if (!finished) {
                console.log('not enough fund.');
                return '';
            }


            const changeAddress = mycoin.changeAdds[0];
            const output1 = Math.round(totalInput
            - amount * Math.pow(10, this.utilServ.getDecimal(mycoin)) - 3000 
            - (receiveAddsIndexArr.length + changeAddsIndexArr.length) * 300);
            const output2 = Math.round(amount * 1e8);         
            txb.addOutput(changeAddress.address, output1);
            txb.addOutput(toAddress, output2);

            for (index = 0; index < receiveAddsIndexArr.length; index ++) {
                const keyPair = this.getKeyPairs(mycoin, seed, 0, receiveAddsIndexArr[index]);
                const alice = Btc.ECPair.fromWIF(keyPair.privateKey, TestNet);
                txb.sign(index, alice);                
            }

            for (index = 0; index < changeAddsIndexArr.length; index ++) {
                const keyPair = this.getKeyPairs(mycoin, seed, 1, changeAddsIndexArr[index]);
                const alice = Btc.ECPair.fromWIF(keyPair.privateKey, TestNet);
                txb.sign(receiveAddsIndexArr.length + index, alice);                
            }            

            const txhex = txb.build().toHex(); Buffer.from(txHashinitMyCoins);
        const bufAmount = Buffer.allocUnsafeinitMyCoins(32);
        bufAmount.writeUInt32BE(amount,0);
        const bufAddr = Buffer.from(address);
        const arr = [bufCoin, bufTxHash, bufAmount, bufAddr];
        const buf = Buffer.concat(arr);
        */

        let buf = '';
        buf += this.utilServ.fixedLengh(coinType, 4);
        buf += this.utilServ.fixedLengh(txHash, 64);
        const hexString = amount.toString(16);
        buf += this.utilServ.fixedLengh(hexString, 64);
        buf += this.utilServ.fixedLengh(address, 64);

        return buf;
    }

    async sendTransaction(mycoin: MyCoin, seed: Buffer, toAddress: string, amount: number, options: any, doSubmit: boolean) {
        console.log('doSubmit in sendTransaction=', doSubmit);
        let index = 0;
        let balance = 0;
        let finished = false;
        let address = '';
        let totalInput = 0;
        
        let gasPrice = 1.2;
        let gasLimit = 21000;
        let satoshisPerBytes = 14;
        let txHex = '';
        let txHash = '';
        let errMsg = '';
        console.log('options=', options);
        if (options) {
            
            if (options.gasPrice) {
                gasPrice = options.gasPrice;
            }
            if (options.gasLimit) {
                gasLimit = options.gasLimit;
            }   
            if (options.satoshisPerBytes) {
                satoshisPerBytes = options.satoshisPerBytes;
            }                      
        }

        const receiveAddsIndexArr = [];
        const changeAddsIndexArr = [];

        console.log('mycoin=');
        console.log(mycoin);
        const bytesPerInput = 148;
        let amountNum = amount * Math.pow(10, this.utilServ.getDecimal(mycoin));
        amountNum += (2 * 34 + 10);
        // 2 output
        console.log('toAddress=' + toAddress + ',amount=' + amount + ',amountNum=' + amountNum);
        const BtcNetwork = environment.chains.BTC.network;

        if (mycoin.name === 'BTC') { // btc address format
            const txb = new Btc.TransactionBuilder(BtcNetwork);

            for (index = 0; index < mycoin.receiveAdds.length; index ++) {
                balance = mycoin.receiveAdds[index].balance;
                if (balance <= 0) {
                    continue;
                }
                address = mycoin.receiveAdds[index].address;
                const balanceFull = await this.apiService.getBtcUtxos(address);
                for (let i = 0; i < balanceFull.length; i++) {
                    const tx = balanceFull[i];
                    console.log('i=' + i);
                    console.log(tx);
                    if (tx.idx < 0) {
                        continue;
                    }
                    txb.addInput(tx.txid, tx.idx);
                    amountNum -= tx.value;
                    amountNum += bytesPerInput * satoshisPerBytes;
                    totalInput += tx.value;
                    receiveAddsIndexArr.push(index);

                    if (amountNum <= 0) {
                        finished = true;
                        break;
                    }
                }    
                if (finished) {
                    break;
                }                            
            }
            if (!finished) {
                for (index = 0; index < mycoin.changeAdds.length; index ++) {
                    balance = mycoin.changeAdds[index].balance;
                    if (balance <= 0) {
                        continue;
                    }
                    address = mycoin.changeAdds[index].address;
                    const balanceFull = await this.apiService.getBtcUtxos(address);
                    for (let i = 0; i < balanceFull.length; i++) {
                        const tx = balanceFull[i];
                        console.log('i=' + i);
                        console.log(tx);
                        if (tx.idx < 0) {
                            continue;
                        }
                        txb.addInput(tx.txid, tx.idx);
                        amountNum -= tx.value;
                        amountNum += bytesPerInput * satoshisPerBytes;
                        totalInput += tx.value;
                        changeAddsIndexArr.push(index);
    
                        if (amountNum <= 0) {
                            finished = true;
                            break;
                        }
                    }    
                    if (finished) {
                        break;
                    }                            
                }
            }

            if (!finished) {
                txHex = '';
                txHash = '';
                errMsg = 'not enough fund.';
                return {txHex: txHex, txHash: txHash, errMsg: errMsg};
            }

            const transFee = (receiveAddsIndexArr.length + changeAddsIndexArr.length) * bytesPerInput * satoshisPerBytes + 2 * 34 + 10;
            const changeAddress = mycoin.changeAdds[0];
            console.log('totalInput=' + totalInput);
            console.log('amount=' + amount);
            console.log('transFee=' + transFee);
            const output1 = Math.round(totalInput - amount * 1e8 - transFee);
            
            const output2 = Math.round(amount * 1e8);         
            txb.addOutput(changeAddress.address, output1);
            txb.addOutput(toAddress, output2);

            for (index = 0; index < receiveAddsIndexArr.length; index ++) {
                const keyPair = this.getKeyPairs(mycoin, seed, 0, receiveAddsIndexArr[index]);
                const alice = Btc.ECPair.fromWIF(keyPair.privateKey, BtcNetwork);
                txb.sign(index, alice);                
            }

            for (index = 0; index < changeAddsIndexArr.length; index ++) {
                const keyPair = this.getKeyPairs(mycoin, seed, 1, changeAddsIndexArr[index]);
                const alice = Btc.ECPair.fromWIF(keyPair.privateKey, BtcNetwork);
                txb.sign(receiveAddsIndexArr.length + index, alice);                
            }             

            txHex = txb.build().toHex();
            console.log('doSubmit=', doSubmit);
            if (doSubmit) {
                console.log('1');
                txHash = await this.apiService.postBtcTx(txHex);
                console.log(txHash);
                
            } else {
                console.log('2');
                const tx = Btc.Transaction.fromHex(txHex);
                txHash = '0x' + tx.getId();
                console.log(txHash);
            }
        } else 
        if (mycoin.name === 'FAB') {
            const res1 = await this.getFabTransactionHex(seed, mycoin, toAddress, amount, 0, satoshisPerBytes);
            txHex = res1.txHex;
            errMsg = res1.errMsg;
            if (!errMsg && txHex) {
                if (doSubmit) {
                    const res = await this.apiService.postFabTx(txHex);
                    txHash = res.txHash;
                    errMsg = res.errMsg;
                } else {
                    const tx = Btc.Transaction.fromHex(txHex);
                    txHash = '0x' + tx.getId();                
                }
            }

        } else
        if (mycoin.name === 'ETH') {
            amountNum = amount * 1e18;

            const address1 = mycoin.receiveAdds[0];
            const currentIndex = address1.index;    
            
            const keyPair = this.getKeyPairs(mycoin, seed, 0, currentIndex);
            const nonce = await this.apiService.getEthNonce(address1.address);
            const txParams = {
                nonce: nonce,
                gasPrice: gasPrice * 1e9,
                gasLimit: gasLimit,
                to: toAddress,
                value: amountNum           
            };

            console.log('txParams=', txParams);
            txHex = await this.web3Serv.signTxWithPrivateKey(txParams, keyPair);

            console.log('txhex for etheruem:', txHex);
            if (doSubmit) {
                txHash = await this.apiService.postEthTx(txHex);
                if (txHash.indexOf('txerError') >= 0) {
                    errMsg = txHash;
                    txHash = '';
                }
            } else {
                txHash = this.web3Serv.getTransactionHash(txHex);
            }
        } else 
        if (mycoin.tokenType === 'ETH') { // etheruem tokens
            const address1 = mycoin.receiveAdds[0];
            gasLimit = 100000;
            const currentIndex = address1.index;    
            console.log('currentIndex=' + currentIndex);
            const keyPair = this.getKeyPairs(mycoin, seed, 0, currentIndex);
            const nonce = await this.apiService.getEthNonce(address1.address);

            let decimals = mycoin.decimals;
            if (!decimals) {
                decimals = 18;
            }
            const amountSent = amount * Math.pow(10, decimals);
            const toAccount = toAddress;
            let contractAddress = mycoin.contractAddr;
            if (mycoin.name === 'USDT') {
                contractAddress = environment.addresses.smartContract.USDT;
            }
            console.log('nonce = ' + nonce);
            const func =    {  
                "constant": false,
                "inputs":[  
                   {  
                      "name":"recipient",
                      "type":"address"
                   },
                   {  
                      "name":"amount",
                      "type":"uint256"
                   }
                ],
                "name":"transfer",
                "outputs":[  
                   {  
                      "name":"",
                      "type":"bool"
                   }
                ],
                "payable":false,
                "stateMutability":"nonpayable",
                "type":"function"
             };
            
            const abiHex = this.web3Serv.getFuncABI(func);
            // a9059cbb
            console.log('abiHexxx=' + abiHex);

            const txData = {
                nonce: nonce,
                gasPrice: gasPrice * 1e9,
                gasLimit: gasLimit,
               // to: contractAddress,
                from: keyPair.address,
                value: Number(0),         
                to : contractAddress,
                data: '0x' + abiHex + this.utilServ.fixedLengh(toAccount.slice(2), 64) + 
                this.utilServ.fixedLengh(amountSent.toString(16), 64)
            };

            console.log('txData=');
            console.log(txData);
            txHex = await this.web3Serv.signTxWithPrivateKey(txData, keyPair);
            console.log('after sign');
            if (doSubmit) {
                console.log('111');
                txHash = await this.apiService.postEthTx(txHex);

                if (txHash.indexOf('txerError') >= 0) {
                    errMsg = txHash;
                    txHash = '';
                }
            } else {
                console.log('333');
                txHash = this.web3Serv.getTransactionHash(txHex);
                console.log('444');
            }
        } else
        if (mycoin.tokenType === 'FAB') { // fab tokens
            let decimals = mycoin.decimals;
            if (!decimals) {
                decimals = 18;
            }
            const amountSent = BigInt(amount * Math.pow(10, decimals));
            
            //const abiHex = this.web3Serv.getFabTransferABI([toAddress, amountSent.toString()]);

            const funcTransfer =	{
                "constant": false,
                "inputs": [
                  {
                    "name": "to",
                    "type": "address"
                  },
                  {
                    "name": "value",
                    "type": "uint256"
                  }
                ],
                "name": "transfer",
                "outputs": [
                  {
                    "name": "",
                    "type": "bool"
                  }
                ],
                "payable": false,
                "stateMutability": "nonpayable",
                "type": "function"
              }; 
            console.log('foreeeee');
            let fxnCallHex = abi.encodeFunctionCall(funcTransfer, [toAddress, amountSent.toString()]);
            console.log('enddddd');
            fxnCallHex = this.utilServ.stripHexPrefix(fxnCallHex);
            let contractAddress = mycoin.contractAddr;
            if (mycoin.name === 'EXG') {
                contractAddress = environment.addresses.smartContract.EXG;
            }
            //const keyPair = this.getKeyPairs(mycoin, seed, 0, 0);
            
            //contractAddress = '0x28a6efffaf9f721a1e95667e3de54c622edc5ffa';
            contractAddress = this.utilServ.stripHexPrefix(contractAddress);
            console.log('contractAddress=' + contractAddress);
            gasLimit = 800000;
            gasPrice = 40;
            const totalAmount = gasLimit * gasPrice / 1e8;
            // let cFee = 3000 / 1e8 // fee for the transaction
              
            console.log('fxnCallHex=' + fxnCallHex);
            let totalFee = totalAmount;
            const contract = Btc.script.compile([
                84,
                this.utilServ.number2Buffer(gasLimit),
                this.utilServ.number2Buffer(gasPrice),
                this.utilServ.hex2Buffer(fxnCallHex),
                this.utilServ.hex2Buffer(contractAddress),
                194
            ]);
            
            console.log('contract=====', contract);
            const contractSize = contract.toJSON.toString().length;
    
            console.log('contractSize=' + contractSize);
            totalFee += this.utilServ.convertLiuToFabcoin(contractSize * 10);
            
            console.log('totalFee=' + totalFee);
            
            const res1 = await this.getFabTransactionHex(seed, mycoin.baseCoin, contract, 0, totalFee, satoshisPerBytes);
            console.log('res1=', res1);
            txHex = res1.txHex;
            errMsg = res1.errMsg;
            if (txHex) {
                if (doSubmit) {
                    const res = await this.apiService.postFabTx(txHex);
                    txHash = res.txHash;
                    errMsg = res.errMsg;
                } else {
                    const tx = Btc.Transaction.fromHex(txHex);
                    txHash = '0x' + tx.getId();                
                }
            }
        }
        return {txHex: txHex, txHash: txHash, errMsg: errMsg};
    }

    fillUpAddress(mycoin: MyCoin, seed: Buffer, numReceiveAdds: number, numberChangeAdds: number) {
        console.log('fillUpAddress for MyCoin');
        console.log(mycoin);
        for (let i = 0; i < numReceiveAdds; i++) {
            const keyPair = this.getKeyPairs(mycoin, seed, 0, i);
            const addr = new Address(mycoin.coinType, keyPair.address, i);
            mycoin.receiveAdds.push(addr);            
        }
        for (let i = 0; i < numberChangeAdds; i++) {
            const keyPair = this.getKeyPairs(mycoin, seed, 1, i);
            const addr = new Address(mycoin.coinType, keyPair.address, i);
            mycoin.changeAdds.push(addr);            
        }        

    }      
}
