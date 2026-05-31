# DDNet Custom Communities

https://github.com/sjrc6/TaterClient-ddnet/issues/83
https://github.com/chillerbot-cc/chillerbot-cc/issues/8

People want more communities and people are slow!

## Clients implementing this

* [TClient](https://github.com/TaterClient/TClient) (since 10.5.3)
* [Kaizo Client](https://github.com/M0REKZ/kaizo-client)
* [Entity Client](https://github.com/FoxNet-DDNet/Entity-Client-DDNet) (since v1.5.0)
* [Duck 'n' Infclass Client](https://github.com/Pointer31/ddnet_client)

## Custom communities currently added

Sorted by order of addition. Maintainers are responsible for updating the data here but don't necessarily own the servers.

* [Away](https://discord.gg/M4hCVnyyZ2) maintained by [@tsk-xp](https://github.com/xp)
* [DDFightNetwork](https://ddfight.net) maintained by [@swarfeya](https://github.com/swarfeya)
* [Souly stuff](https://discord.gg/xpHMrX2xGT) maintained by [@SoulyVEVO](https://github.com/SoulyVEVO)
* [TeeUnion](https://teeunion.ru) maintained by [@Sedonya](https://github.com/Sedonya)
* [Legit Network](https://legitnetwork.xyz) maintained by [@ka3drtw](https://github.com/ka3drtw)
* [FoxNetwork](https://discord.gg/ZH4ZuPkuK7) maintained by [@qxdFox](https://github.com/qxdFox)
* [cazar](https://cazar.xyz) maintained by [@cazar](https://github.com/cazar-clan)
* [Pointer's Labs](https://matrix.to/#/#pointerslabs-space:matrix.org) maintained by [@Pointer31](https://github.com/pointer31)
* [Eternal Gores](https://discord.gg/vm6vGgqRvr) maintained by [@snezhnyyy](https://github.com/snezhnyyy)

## Requirements

* You have atleast 3 game servers
* Some moderators
* Reports in game, through Discord or web
* A Discord server or website in /info or MOTD
* Follows master server rules, seen [here](https://ddnet.org/rules/master/)
* Servers have /rules similar to DDNet
* All servers start with the community name

Do note that these rules can be bent both ways and are subject to mine and others' judgement

## How to add your own community

1. Meet requirements
2. Add icon to `icons`
3. Add data to `custom-communities-ddnet-info.json`
4. Add community to `README.md`
5. Create a PR

Make sure to run `node ./scripts/format.mjs`
Also run `node ./scripts/verify-flagids.mjs` to validate `name` and `flagId` country/region mappings.

