//var decentr = require("decentr-js")
var assert = require('assert');
var shell = require('shelljs')

describe('Community', function() {
    var jack, alice
    var node

    beforeEach(function() {
        this.timeout(10000)

        shell.rm('-rf', '~/.decentrd')
        shell.rm('-rf',  '~/.decentrcli')

        shell.exec('decentrd init test --chain-id=testnet')

        shell.exec('decentrcli config output json')
        shell.exec('decentrcli config trust-node true')
        shell.exec('decentrcli config chain-id testnet')
        shell.exec('decentrcli config keyring-backend test')

        jack = JSON.parse(shell.exec('decentrcli keys add jack', {silent:true}).stderr)
        alice = JSON.parse(shell.exec('decentrcli keys add alice', {silent:true}).stderr)

        shell.exec('decentrd add-genesis-account $(decentrcli keys show jack -a) 1000000udec')
        shell.exec('decentrd add-genesis-account $(decentrcli keys show alice -a) 1000000udec')

        shell.exec('decentrd gentx --name jack --keyring-backend test --amount 1000000udec')
        shell.exec('decentrd collect-gentxs')
        shell.exec('decentrd validate-genesis')
        node = shell.exec('decentrd start', {async:true})
        shell.exec('sleep 5')
    });

    afterEach(function() {
        node.kill()
    });

    describe('#indexOf()', function() {
        it('should return -1 when the value is not present', function() {
            assert.equal([1, 2, 3].indexOf(4), -1);
        });
    });
});
