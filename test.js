
const decentr = require("decentr-js")
const assert = require('chai').assert
const shell = require('shelljs')

const restUrl = 'http://localhost:1317';
const chainId = 'testnet';

describe("blockchain", function () {
    let jack, alice
    let decentrd, decentcli

    beforeEach(function (done) {
        this.timeout(20 * 1000)
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
        decentrd = shell.exec(`decentrd start --community-moderator-addr=${jack.address}`, {async: true})
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

    afterEach(async function () {
        decentcli.kill("SIGINT")
        decentrd.kill("SIGINT")

        // wait one second to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    describe ("pdv", function() {
        const pdv = {
            "version": "v1",
            "pdv": {
                "domain": "decentr.net",
                "path": "/",
                "user_agent": "mac",
                "data": [
                    {
                        "version": "v1",
                        "type": "cookie",
                        "name": "my cookie",
                        "value": "some value",
                        "domain": "*",
                        "host_only": true,
                        "path": "*",
                        "secure": true,
                        "same_site": "None",
                        "expiration_date": 1861920000
                    }
                ]
            }
        }

        it.only("jack can create a single login pdv", async function () {
            this.timeout(10 * 1000)
            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            const balanceBeforePost = (await dc.getAccount(wallet.address)).coins[0].amount
            assert.isNotEmpty(balanceBeforePost)

            await dc.sendPDV(pdv, decentr.PDVType.LoginCookie, wallet, {
                broadcast: true,
                privateKey: wallet.privateKey,
            })

            const pdvs = await dc.getPDVList(wallet.address)
            assert.lengthOf(pdvs, 1)

            // make sure jack balance has not changed
            const balanceAfterPost = (await dc.getAccount(wallet.address)).coins[0].amount
            assert.equal(balanceBeforePost, balanceAfterPost)

            // token balance increased
            const tokens = await decentr.getTokenBalance(restUrl, wallet.address)
            assert.equal(tokens,  4e-7)
        })

        it.only("jack can create 3 pdvs", async function () {
            this.timeout(30 * 1000)
            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            const balanceBeforePost = (await dc.getAccount(wallet.address)).coins[0].amount
            assert.isNotEmpty(balanceBeforePost)

            for (let i = 0; i < 3; i++) {
                let updated = pdv
                updated.pdv.path = updated.pdv.path + i

                await dc.sendPDV(updated, decentr.PDVType.Cookie, wallet, {
                    broadcast: true,
                    privateKey: wallet.privateKey,
                })
            }

            const pdvs = await dc.getPDVList(wallet.address)
            assert.lengthOf(pdvs, 3)

            // make sure jack balance has not changed
            const balanceAfterPost = (await dc.getAccount(wallet.address)).coins[0].amount
            assert.equal(balanceBeforePost, balanceAfterPost)

            // token balance increased
            const tokens = await decentr.getTokenBalance(restUrl, wallet.address)
            assert.equal(tokens,  6e-7)
        })
    })

    describe("community", function () {
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

            const balanceBeforePost = (await dc.getAccount(wallet.address)).coins[0].amount
            assert.isNotEmpty(balanceBeforePost)

            await dc.createPost(wallet.address, createPost(1), {
                broadcast: true,
                privateKey: wallet.privateKey,
            });

            const posts = await decentr.getUserPosts(restUrl, wallet.address)
            assert.lengthOf(posts, 1)

            // make sure jack balance has not changed
            const balanceAfterPost = (await dc.getAccount(wallet.address)).coins[0].amount
            assert.equal(balanceBeforePost, balanceAfterPost)
        })

        it("jack can create a big post", async function () {
            this.timeout(10 * 1000)
            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            const balanceBeforePost = (await dc.getAccount(wallet.address)).coins[0].amount
            assert.isNotEmpty(balanceBeforePost)

            const post = createPost(1)
            post.text = "x".repeat(64000)

            await dc.createPost(wallet.address, post, {
                broadcast: true,
                privateKey: wallet.privateKey,
            });

            const posts = await decentr.getUserPosts(restUrl, wallet.address)
            assert.lengthOf(posts, 1)

            // make sure jack balance has not changed
            const balanceAfterPost = (await dc.getAccount(wallet.address)).coins[0].amount
            assert.equal(balanceBeforePost, balanceAfterPost)
        })

        it("jack can create a russian post", async function () {
            this.timeout(10 * 1000)
            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            const post = {
                category: decentr.PostCategory.WorldNews,
                previewImage: 'https://someimage.com',
                title: 'Заголовок на русском языке',
                text: 'Здесь немного текста на русском',
            }

            await dc.createPost(wallet.address, post,{
                broadcast: true,
                privateKey: wallet.privateKey,
            });

            const posts = await decentr.getUserPosts(restUrl, wallet.address)
            assert.lengthOf(posts, 1)
            assert.equal(posts[0].title, post.title)
            assert.equal(posts[0].text, post.text)
        })

        it("jack can create 5 posts and delete them", async function () {
            this.timeout(100 * 1000)
            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            for (let i = 0; i < 5; i ++) {
                await dc.createPost(wallet.address, createPost(i), {
                    broadcast: true,
                    privateKey: wallet.privateKey,
                });
            }

            let posts = await decentr.getUserPosts(restUrl, wallet.address)
            assert.lengthOf(posts, 5)

            for (let i = 0; i < 5; i ++) {
                await dc.deletePost(wallet.address, {
                    author: posts[i].owner,
                    postId: posts[i].uuid,
                }, {
                    broadcast: true,
                    privateKey: wallet.privateKey,
                });

                const postsAfterDelete =  await decentr.getUserPosts(restUrl, wallet.address)
                assert.lengthOf(postsAfterDelete, 5-1-i)
            }
        })

        it("alice can not delete jack's post", async function () {
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

           try {
                await dc.deletePost(aliceWallet.address, {
                   author: posts[0].owner,
                   postId: posts[0].uuid,
               }, {
                   broadcast: true,
                   privateKey: aliceWallet.privateKey,
               });
           } catch (e) {
               assert.isTrue(e.response.data.error.includes("unauthorized: Incorrect Owner"))
           }

            posts = await decentr.getUserPosts(restUrl, jackWallet.address)
            assert.lengthOf(posts, 1)
        })

        it("jack as moderator can delete any post", async function () {
            this.timeout(20 * 1000)

            const jackWallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const aliceWallet = decentr.createWalletFromMnemonic(alice.mnemonic)

            const dc = new decentr.Decentr(restUrl, chainId)

            await dc.createPost(aliceWallet.address, createPost(1), {
                broadcast: true,
                privateKey: aliceWallet.privateKey,
            });

            let posts = await decentr.getUserPosts(restUrl, aliceWallet.address)
            assert.lengthOf(posts, 1)

            await dc.deletePost(jackWallet.address, {
                author: posts[0].owner,
                postId: posts[0].uuid,
            }, {
                broadcast: true,
                privateKey: jackWallet.privateKey,
            });

            posts = await decentr.getUserPosts(restUrl, aliceWallet.address)
            assert.lengthOf(posts, 0)
        })

        it(`jack can create a post and alice likes it and 
                jack can delete liked post`, async function () {
            this.timeout(30 * 1000)

            const jackWallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const aliceWallet = decentr.createWalletFromMnemonic(alice.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            const balanceBeforePost = (await dc.getAccount(aliceWallet.address)).coins[0].amount
            assert.isNotEmpty(balanceBeforePost)

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

            // make sure alice balance has not changed
            const balanceAfterPost = (await dc.getAccount(aliceWallet.address)).coins[0].amount
            assert.equal(balanceBeforePost, balanceAfterPost)

            posts = await decentr.getUserPosts(restUrl, jackWallet.address)
            assert.lengthOf(posts, 1)
            assert.equal(posts[0].likesCount, 1)

            // token balance increased
            const tokens = await decentr.getTokenBalance(restUrl, jackWallet.address)
            assert.equal(tokens,  1e-7)

            // one stats item created
            const stats1 = await decentr.getPDVStats(restUrl, jackWallet.address)
            assert.lengthOf(stats1, 1)

            // alice has one liked post
            const likedPosts1 = await decentr.getLikedPosts(restUrl, aliceWallet.address)
            assert.equal(Object.keys(likedPosts1).length, 1)
            const postUUID = Object.keys(likedPosts1)[0]
            assert.equal(likedPosts1[postUUID], decentr.LikeWeight.Up)

            // jack deleted liked post
            await dc.deletePost(jackWallet.address, {
                author: posts[0].owner,
                postId: posts[0].uuid,
            }, {
                broadcast: true,
                privateKey: jackWallet.privateKey,
            });

            // make sure jack has no posts
            posts = await decentr.getUserPosts(restUrl, jackWallet.address)
            assert.lengthOf(posts, 0)

            // alice has no liked post
            const likedPosts2 = await decentr.getLikedPosts(restUrl, aliceWallet.address)
            assert.equal(Object.keys(likedPosts2).length, 1)

            // jack token has not changed
            const tokens2 = await decentr.getTokenBalance(restUrl, jackWallet.address)
            assert.equal(tokens2,  1e-7)

            // make sure stats not changed
            const stats2 = await decentr.getPDVStats(restUrl, jackWallet.address)
            assert.lengthOf(stats2, 1)
        })

        it("jack can create a post and alice dislikes it and than remove dislike", async function () {
            this.timeout(30 * 1000)

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
            const tokens1 = await decentr.getTokenBalance(restUrl, jackWallet.address)
            assert.equal(tokens1,  -1e-7)

            // one stats item created
            const stats1 = await decentr.getPDVStats(restUrl, jackWallet.address)
            assert.lengthOf(stats1, 1)

            // alice has one liked post
            const likedPosts1 = await decentr.getLikedPosts(restUrl, aliceWallet.address)
            assert.equal(Object.keys(likedPosts1).length, 1)
            const postUUID = Object.keys(likedPosts1)[0]
            assert.equal(likedPosts1[postUUID], decentr.LikeWeight.Down)

            // alice reset like the post
            await decentr.likePost(restUrl, chainId, aliceWallet.address,  {
                author: posts[0].owner,
                postId: posts[0].uuid,
            }, decentr.LikeWeight.Zero, {
                broadcast: true,
                privateKey: aliceWallet.privateKey,
            })

            const likedPosts2 = await decentr.getLikedPosts(restUrl, aliceWallet.address)
            assert.equal(Object.keys(likedPosts2).length, 0)

            // token balance reset
            const tokens2 = await decentr.getTokenBalance(restUrl, jackWallet.address)
            assert.equal(tokens2, 0)
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
                assert.equal(e.response.data.error, "invalid request: post's length should be between 15 symbols and 64000 bytes")
            }
        })

        it("jack cannot create a post with a large text", async function () {
            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            const post = createPost(1)
            post.text = "x".repeat(64000 + 1)

            try {
                await dc.createPost(wallet.address, post, {
                    broadcast: true,
                    privateKey: wallet.privateKey,
                });
            }catch (e) {
                assert.equal(e.response.data.error, "invalid request: post's length should be between 15 symbols and 64000 bytes")
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

            const randCategory = () => Math.floor(Math.random() * Math.floor(8)) + 1

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

        it("jack can create 10 posts and paginate through them", async function () {
            this.timeout(100 * 1000)

            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            for (let i = 0; i < 10; i++) {
                const post = createPost(i)

                await dc.createPost(wallet.address, post, {
                    broadcast: true,
                    privateKey: wallet.privateKey,
                });
            }


            // users posts
            let posts = await decentr.getUserPosts(restUrl, wallet.address, {limit: 5})
            assert.lengthOf(posts, 5)

            posts = await decentr.getUserPosts(restUrl, wallet.address, {limit: 2, from: posts[4].uuid})
            assert.lengthOf(posts, 2)

            posts = await decentr.getUserPosts(restUrl, wallet.address, {limit: 10, from: posts[1].uuid})
            assert.lengthOf(posts, 3)


            // latest posts
            posts = await decentr.getLatestPosts(restUrl, {category:  decentr.PostCategory.WorldNews, limit: 5})
            assert.lengthOf(posts, 5)


            posts = await decentr.getLatestPosts(restUrl, {category:  decentr.PostCategory.WorldNews, limit: 2, fromOwner: posts[4].owner, fromUUID: posts[4].uuid})
            assert.lengthOf(posts, 2)


            posts = await decentr.getLatestPosts(restUrl,  {category:  decentr.PostCategory.WorldNews, limit: 10, fromOwner: posts[1].owner, fromUUID: posts[1].uuid})
            assert.lengthOf(posts, 3)

            // popular posts
            posts = await decentr.getPopularPosts(restUrl, "day", {limit: 5})
            assert.lengthOf(posts, 5)

            posts = await decentr.getPopularPosts(restUrl, "day", {limit: 2, fromOwner: posts[4].owner, fromUUID: posts[4].uuid})
            assert.lengthOf(posts, 2)

            posts = await decentr.getPopularPosts(restUrl, "day", {limit: 10, fromOwner: posts[1].owner, fromUUID: posts[1].uuid})
            assert.lengthOf(posts, 3)

            posts = await decentr.getPopularPosts(restUrl, "week", {limit: 5})
            assert.lengthOf(posts, 5)

            posts = await decentr.getPopularPosts(restUrl, "week", {limit: 2, fromOwner: posts[4].owner, fromUUID: posts[4].uuid})
            assert.lengthOf(posts, 2)

            posts = await decentr.getPopularPosts(restUrl, "week", {limit: 10, fromOwner: posts[1].owner, fromUUID: posts[1].uuid})
            assert.lengthOf(posts, 3)

            posts = await decentr.getPopularPosts(restUrl, "month", {limit: 5})
            assert.lengthOf(posts, 5)

            posts = await decentr.getPopularPosts(restUrl, "month", {limit: 2, fromOwner: posts[4].owner, fromUUID: posts[4].uuid})
            assert.lengthOf(posts, 2)

            posts = await decentr.getPopularPosts(restUrl, "month", {limit: 10, fromOwner: posts[1].owner, fromUUID: posts[1].uuid})
            assert.lengthOf(posts, 3)

        })

        it("jack can create 3 posts and they are popular", async function () {
            this.timeout(30 * 1000)

            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            for (let i = 0; i < 3; i++) {
                const post = createPost(i)

                await dc.createPost(wallet.address, post, {
                    broadcast: true,
                    privateKey: wallet.privateKey,
                });
            }

            let posts = await decentr.getPopularPosts(restUrl, "day")
            assert.lengthOf(posts, 3)

            posts = await decentr.getPopularPosts(restUrl, "week")
            assert.lengthOf(posts, 3)

            posts = await decentr.getPopularPosts(restUrl, "month")
            assert.lengthOf(posts, 3)
        })

        it("jack can create 3 latest posts", async function () {
            this.timeout(30 * 1000)

            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            for (let i = 0; i < 3; i++) {
                const post = createPost(i)

                await dc.createPost(wallet.address, post, {
                    broadcast: true,
                    privateKey: wallet.privateKey,
                });
            }

            let posts = await decentr.getLatestPosts(restUrl, {category:  decentr.PostCategory.WorldNews})
            assert.lengthOf(posts, 3)

            posts = await decentr.getLatestPosts(restUrl, {category:  decentr.PostCategory.HealthAndFitness})
            assert.lengthOf(posts, 0)
        })
    })

    describe("profile", function () {

        it("jack registeredAt date is not empty and initial balance is 1", async function () {
            this.timeout(20 * 1000)

            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            const publicProfile = {
                firstName: "jack",
                lastName: "ozborn",
                gender: decentr.Gender.Male,
                avatar: "https://avatars.com/jack",
                birthday: "2010-01-03"
            }

            await dc.setPublicProfile(wallet.address, publicProfile,{
                broadcast: true,
                privateKey: wallet.privateKey,
            })

            let profile  = await dc.getPublicProfile(wallet.address)
            assert.isNotEmpty(profile.registeredAt)

            const registeredAt = profile.registeredAt

            await dc.setPublicProfile(wallet.address, publicProfile,{
                broadcast: true,
                privateKey: wallet.privateKey,
            })

            profile  = await dc.getPublicProfile(wallet.address)
            assert.equal(profile.registeredAt, registeredAt, "registeredAt changed")

            const balance = await dc.getTokenBalance(wallet.address)
            assert.equal(1, balance)
        })

        it("jack can set private profile", async function () {
            this.timeout(20 * 1000)

            const wallet = decentr.createWalletFromMnemonic(jack.mnemonic)
            const dc = new decentr.Decentr(restUrl, chainId)

            const privateProfile = {
                firstName: "jack",
                lastName: "ozborn",
            }

            await dc.setPrivateProfile(wallet.address, privateProfile, wallet.privateKey)

            const profile  = await dc.getPrivateProfile(wallet.address, wallet.privateKey)
            assert.equal(privateProfile, profile)
        })
    })

});
