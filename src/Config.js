const Config = {
    /**
     * {Number} Maximum value of every element in orgProbs array
     * @constant
     */
    PROB_MAX_VALUE    : 100,
    /**
     * {Number} Maximum period between mutations
     * @constant
     */
    ORG_MAX_PERIOD    : 5000,

    worldWidth        : 300,
    worldHeight       : 300,
    worldEnergy       : 100,
    worldEnegyPeriod  : 10000000,
    worldEnergyPercent: .3,
    worldEnergyColor  : 0x00ff00,

    linesPerIteration : 30,
    iterationsPerRun  : 100,

    orgAmount         : 1000,
    orgEnergy         : 1000,
    orgColor          : 0xff0000,
    orgMemSize        : 64,
    orgMutationPercent: .2,
    orgMutationPeriod : 4000,
    orgProbs          : [5,1,3,5,1,20,1,1], // change,del,period,amount,probs,insert,copy,cut
    orgEnergyPeriod   : 50,
    orgCodeMaxSize    : 1000
};

module.exports = Config;