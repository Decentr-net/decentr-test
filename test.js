//var decentr = require("decentr-js")
var assert = require('chai').assert
var shell = require('shelljs')

describe('community', function() {
    var jack, alice
    var node

    beforeEach(function(done) {
        this.timeout(10000)

        shell.rm('-rf', '~/.decentrd')
        shell.rm('-rf',  '~/.decentrcli')

        shell.exec('decentrd init test --chain-id=testnet', {silent:true})

        shell.exec('decentrcli config output json', {silent:true})
        shell.exec('decentrcli config trust-node true', {silent:true})
        shell.exec('decentrcli config chain-id testnet', {silent:true})
        shell.exec('decentrcli config keyring-backend test', {silent:true})

        // yes, output is in stderr
        jack = JSON.parse(shell.exec('decentrcli keys add jack', {silent:true}).stderr)
        alice = JSON.parse(shell.exec('decentrcli keys add alice', {silent:true}).stderr)

        shell.exec('decentrd add-genesis-account $(decentrcli keys show jack -a) 1000000udec', {silent:true})
        shell.exec('decentrd add-genesis-account $(decentrcli keys show alice -a) 1000000udec', {silent:true})

        shell.exec('decentrd gentx --name jack --keyring-backend test --amount 1000000udec', {silent:true})
        shell.exec('decentrd collect-gentxs', {silent:true})
        shell.exec('decentrd validate-genesis', {silent:true})
        node = shell.exec('decentrd start', {async: true, silent:true})
        node.stdout.on('data', function (data) {
            if (data.includes("Executed block")) {
                done()
            }
        })
    });

    afterEach(function() {
        node.kill()
    });

    describe("accounts", function() {
        it('jack and alice have mnemonic', function() {
            assert.isNotEmpty(jack.mnemonic)
            assert.isNotEmpty(alice.mnemonic)
        });
    });
});
