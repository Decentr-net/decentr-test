var decentr = require("decentr-js")
var assert = require('chai').assert
var shell = require('shelljs')

const restUrl = 'http://localhost:1317';
const chainId = 'testnet';

describe('community', function() {
    var jack, alice
    var decentrd, decentcli

    beforeEach(function(done) {
        this.timeout(10000)
        shell.config.silent = true;

        shell.rm('-rf', '~/.decentrd')
        shell.rm('-rf',  '~/.decentrcli')

        shell.exec('decentrd init test --chain-id=' + chainId)

        shell.exec('decentrcli config output json')
        shell.exec('decentrcli config trust-node true')
        shell.exec('decentrcli config chain-id testnet')
        shell.exec('decentrcli config keyring-backend test')

        // yes, output is in stderr
        jack = JSON.parse(shell.exec('decentrcli keys add jack').stderr)
        alice = JSON.parse(shell.exec('decentrcli keys add alice').stderr)

        shell.exec('decentrd add-genesis-account $(decentrcli keys show jack -a) 1000000udec')
        shell.exec('decentrd add-genesis-account $(decentrcli keys show alice -a) 1000000udec')

        shell.exec('decentrd gentx --name jack --keyring-backend test --amount 1000000udec')
        shell.exec('decentrd collect-gentxs')
        shell.exec('decentrd validate-genesis')
        decentrd = shell.exec('decentrd start', {async: true})
        decentrd.stdout.on('data', function (data) {
            if (data.includes("Executed block")) {
                decentcli = shell.exec('decentrcli rest-server', {async: true})
                done()
            }
        })
    });

    afterEach(function() {
        decentcli.kill()
        decentrd.kill()
    });

    describe("accounts", function() {
        it("jack and alice have mnemonic", function() {
            assert.isNotEmpty(jack.mnemonic)
            assert.isNotEmpty(alice.mnemonic)
        });
    });

    describe("blog", function () {
        it("jack can create a post", function () {
            var dc = new decentr.Decentr(restUrl, chainId)
            var wallet = decentr.createWalletFromMnemonic(jack.mnemonic)

            const post = {
                category: decentr.PostCategory.WorldNews,
                previewImage: 'https://someimage.com',
                title: 'Post title',
                text: 'Post text',
            }

            dc.createPost(wallet.address, post,   {
                broadcast: true,
                privateKey: wallet.privateKey,
            });
        })
    })
});
