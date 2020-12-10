let decentr = require("decentr-js")
let assert = require('chai').assert
let shell = require('shelljs')

const restUrl = 'http://localhost:1317';
const chainId = 'testnet';

describe('community', function () {
    let jack, alice
    let decentrd, decentcli

    beforeEach(function (done) {
        this.timeout(10000)
        shell.config.silent = true;

        // remove decentr home folders
        shell.rm('-rf', '~/.decentrd')
        shell.rm('-rf', '~/.decentrcli')

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

    afterEach(function () {
        decentcli.kill("SIGINT")
        decentrd.kill("SIGINT")
    });

    const createPost = function(idx) {
        return {
            category: decentr.PostCategory.WorldNews,
            previewImage: 'https://someimage.com' + idx,
            title: 'Post title' + idx,
            text: 'This is some dummy text greater than 15 symbols' + idx,
        }
    }

    it("jack can create a post", async function () {
        this.timeout(10 * 1000)
        const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        const dc = new decentr.Decentr(restUrl, chainId)

        await dc.createPost(wallet.address, createPost(1), {
            broadcast: true,
            privateKey: wallet.privateKey,
        });

        const posts = await decentr.getUserPosts(restUrl, wallet.address)
        assert.lengthOf(posts, 1)
    })

    it("jack can create and delete own post", async function () {
        this.timeout(20 * 1000)
        const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        const dc = new decentr.Decentr(restUrl, chainId)

        await dc.createPost(wallet.address, createPost(1), {
            broadcast: true,
            privateKey: wallet.privateKey,
        });

        let posts = await decentr.getUserPosts(restUrl, wallet.address)
        assert.lengthOf(posts, 1)

        await dc.deletePost(wallet.address, {
            author: posts[0].owner,
            postId: posts[0].uuid,
        }, {
            broadcast: true,
            privateKey: wallet.privateKey,
        });

        posts = await decentr.getUserPosts(restUrl, wallet.address)
        assert.lengthOf(posts, 0)
    })

    it("jack can create a post and alice likes it", async function () {
        this.timeout(20 * 1000)

        const jackWallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        const aliceWallet = decentr.createWalletFromMnemonic(alice.mnemonic)
        const dc = new decentr.Decentr(restUrl, chainId)

        await dc.createPost(jackWallet.address, createPost(1), {
            broadcast: true,
            privateKey: jackWallet.privateKey,
        });

        let posts = await decentr.getUserPosts(restUrl, jackWallet.address)
        assert.lengthOf(posts, 1)
        assert.equal(posts[0].likesCount, 0)

        // alice likes the post
        await decentr.likePost(restUrl, chainId, aliceWallet.address,  {
                author: posts[0].owner,
                postId: posts[0].uuid,
            }, decentr.LikeWeight.Up, {
            broadcast: true,
            privateKey: aliceWallet.privateKey,
        })

        posts = await decentr.getUserPosts(restUrl, jackWallet.address)
        assert.lengthOf(posts, 1)
        assert.equal(posts[0].likesCount, 1)

        // token balance increased
        const tokens = await decentr.getTokenBalance(restUrl, jackWallet.address)
        assert.equal(tokens,  1e-7)

        // one stats item created
        const stats = await decentr.getPDVStats(restUrl, jackWallet.address)
        assert.lengthOf(stats, 1)
    })

    it("jack can create a post and alice dislikes it", async function () {
        this.timeout(20 * 1000)

        const jackWallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        const aliceWallet = decentr.createWalletFromMnemonic(alice.mnemonic)
        const dc = new decentr.Decentr(restUrl, chainId)

        await dc.createPost(jackWallet.address, createPost(1), {
            broadcast: true,
            privateKey: jackWallet.privateKey,
        });

        let posts = await decentr.getUserPosts(restUrl, jackWallet.address)
        assert.lengthOf(posts, 1)
        assert.equal(posts[0].dislikesCount, 0)

        // alice likes the post
        await decentr.likePost(restUrl, chainId, aliceWallet.address,  {
            author: posts[0].owner,
            postId: posts[0].uuid,
        }, decentr.LikeWeight.Down, {
            broadcast: true,
            privateKey: aliceWallet.privateKey,
        })

        posts = await decentr.getUserPosts(restUrl, jackWallet.address)
        assert.lengthOf(posts, 1)
        assert.equal(posts[0].dislikesCount, 1)

        // token balance increased
        const tokens = await decentr.getTokenBalance(restUrl, jackWallet.address)
        assert.equal(tokens,  -1e-7)

        // one stats item created
        const stats = await decentr.getPDVStats(restUrl, jackWallet.address)
        assert.lengthOf(stats, 1)
    })

    it("jack cannot create a post with a short text", async function () {
        const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        const dc = new decentr.Decentr(restUrl, chainId)

        const post = createPost(1)
        post.text = "short"

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
        this.timeout(100 * 1000)

        const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        const dc = new decentr.Decentr(restUrl, chainId)

        for (let i = 0; i < 10; i++) {
            await dc.createPost(wallet.address, createPost(i), {
                broadcast: true,
                privateKey: wallet.privateKey,
            });
        }

        const posts = await decentr.getUserPosts(restUrl, wallet.address)
        assert.lengthOf(posts, 10)
    })

    it("jack can create 10 posts of the different categories", async function () {
        this.timeout(100 * 1000)

        const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
        const dc = new decentr.Decentr(restUrl, chainId)

        const randCategory = () => Math.floor(Math.random() * Math.floor(6)) + 1

        for (let i = 0; i < 10; i++) {
            const post = createPost(i)
            post.category = randCategory()

            await dc.createPost(wallet.address, post, {
                broadcast: true,
                privateKey: wallet.privateKey,
            });
        }

        const posts = await decentr.getUserPosts(restUrl, wallet.address, {limit: 20})
        assert.lengthOf(posts, 10)
    })
});
