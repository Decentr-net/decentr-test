let decentr = require("decentr-js")
let assert = require('chai').assert
let shell = require('shelljs')

const restUrl = 'http://localhost:1317';
const chainId = 'testnet';

describe('community', function() {
    let jack, alice
    let decentrd, decentcli

    beforeEach(function(done) {
        this.timeout(10000)
        shell.config.silent = true;

        // remove decentr home folders
        shell.rm('-rf', '~/.decentrd')
        shell.rm('-rf',  '~/.decentrcli')

        shell.exec('decentrd init test --chain-id=' + chainId)

        // configure decentrcli
        shell.exec('decentrcli config output json')
        shell.exec('decentrcli config trust-node true')
        shell.exec('decentrcli config chain-id testnet')
        shell.exec('decentrcli config keyring-backend test')

        // save two accounts with keys
        // yes, output is in stderr
        jack = JSON.parse(shell.exec('decentrcli keys add jack').stderr)
        alice = JSON.parse(shell.exec('decentrcli keys add alice').stderr)

        // prepare genesis.json
        shell.exec(`decentrd add-genesis-account ${jack.address} 100000000udec`)
        shell.exec(`decentrd add-genesis-account ${alice.address} 100000000udec`)
        shell.exec('decentrd gentx --name jack --keyring-backend test --amount 1000000udec')
        shell.exec('decentrd collect-gentxs')
        shell.exec('decentrd validate-genesis')

        // run the node
        decentrd = shell.exec('decentrd start', {async: true})
        let up = false
        decentrd.stdout.on('data', function (data) {
            if (data.includes("Executed block") && !up) {
                up = true
                // run the rest server connected to the node
                decentcli = shell.exec("decentrcli rest-server", {async: true})
                decentcli.stdout.on('data', function (cli) {
                    if (cli.includes("Starting RPC HTTP server on")) {
                        done()
                    }
                })
            }
        })
    });

    afterEach(function() {
        decentcli.kill()
        decentrd.kill()
    });

    it("jack and alice have mnemonic", function() {
        assert.isNotEmpty(jack.mnemonic)
        assert.isNotEmpty(alice.mnemonic)
    });

    it("jack can create a post", async function () {
        this.timeout(10000)
        let wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        let dc = new decentr.Decentr(restUrl, chainId)

        const post = {
            category: decentr.PostCategory.WorldNews,
            previewImage: 'https://someimage.com',
            title: 'Post title',
            text: 'This is some dummy text greater than 15 symbols',
        }

        await dc.createPost(wallet.address, post, {
            broadcast: true,
            privateKey: wallet.privateKey,
        });
    })

    it("jack cannot create a post with a short text", async function () {
        let wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        let dc = new decentr.Decentr(restUrl, chainId)

        const post = {
            category: decentr.PostCategory.WorldNews,
            previewImage: 'https://someimage.com',
            title: 'Post title',
            text: 'Post text',
        }

        try {
            await dc.createPost(wallet.address, post, {
                broadcast: true,
                privateKey: wallet.privateKey,
            });
        }catch (e) {
            assert.equal(e.response.data.error, "invalid request: post's length should be between 15 and 10000")
        }
    })

    it("jack can create 10 posts of the same category", async function () {
        this.timeout(10 * 10000)

        let wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        let dc = new decentr.Decentr(restUrl, chainId)

        for (let i = 0; i < 10; i++) {
            const post = {
                category: decentr.PostCategory.WorldNews,
                previewImage: 'https://someimage.com',
                title: 'Post title' + i,
                text: 'This is some dummy text greater than 15 symbols ' + i,
            }

            let resp = await dc.createPost(wallet.address, post, {
                broadcast: true,
                privateKey: wallet.privateKey,
            });

            console.log(resp)
        }
    })

});
