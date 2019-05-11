/**
 * Supported commands:
 *   N                  - number - sets this number to d. number in range -CODE_CMD_OFFS...CODE_CMD_OFFS
 *   CODE_CMD_OFFS + 0  - step   - moves organism using d (one of 8) direction
 *   CODE_CMD_OFFS + 1  - eat    - eats something using d (one of 8) direction, ate energy will be in b
 *   CODE_CMD_OFFS + 2  - clone  - clones himself using d (one of 8) direction, 0|1 will be in b
 *   CODE_CMD_OFFS + 3  - see    - see in point: (offs), dot will be in d
 *   CODE_CMD_OFFS + 4  - dtoa   - copy value from d to a
 *   CODE_CMD_OFFS + 5  - dtob   - copy value from d to b
 *   CODE_CMD_OFFS + 6  - atod   - copy value from a to d
 *   CODE_CMD_OFFS + 7  - btod   - copy value from b to d
 *   CODE_CMD_OFFS + 8  - add    - d = a + b
 *   CODE_CMD_OFFS + 9  - sub    - d = a - b
 *   CODE_CMD_OFFS + 10 - mul    - d = a * b
 *   CODE_CMD_OFFS + 11 - div    - d = a / b
 *   CODE_CMD_OFFS + 12 - inc    - d++
 *   CODE_CMD_OFFS + 13 - dec    - d--
 *   CODE_CMD_OFFS + 14 - loop   - loop d times till end or skip
 *   CODE_CMD_OFFS + 15 - ifdgb  - if d > a
 *   CODE_CMD_OFFS + 16 - ifdla  - if d < a
 *   CODE_CMD_OFFS + 17 - ifdea  - if d == a
 *   CODE_CMD_OFFS + 18 - nop    - no operation
 *   CODE_CMD_OFFS + 19 - mget   - a = mem[d]
 *   CODE_CMD_OFFS + 20 - mput   - mem[d] = a
 *   CODE_CMD_OFFS + 21 - offs   - d = org.offset
 *   CODE_CMD_OFFS + 22 - rand   - a = rand(-CODE_CMD_OFFS..CODE_CMD_OFFS)
 *   CODE_CMD_OFFS + 23 - call   - calls function with name/index d % funcAmount
 *   CODE_CMD_OFFS + 24 - func   - function begin operator
 *   CODE_CMD_OFFS + 25 - ret    - returns from function. d will be return value
 *   CODE_CMD_OFFS + 26 - end    - function/ifxxx finish operator. no return value
 *   CODE_CMD_OFFS + 27 - get    - get object using d (one of 8) direction, get object will be in b
 *   CODE_CMD_OFFS + 28 - put    - put object using d (one of 8) direction, put object will be in b
 *   CODE_CMD_OFFS + 29 - mix    - mix near object and one from d (one of 8) direction into new one, mix will be in b
 *
 * @author flatline
 */
const Config    = require('./../Config');
const FastArray = require('./../common/FastArray');
const Helper    = require('./../common/Helper');
const Db        = require('./../common/Db');
const Organism  = require('./Organism');
const Mutations = require('./Mutations');
const World     = require('./World');
const Surface   = require('./Surface');
/**
 * {Number} This value very important. This is amount of total energy in a world
 * (organisms + energy). This value organisms must not exceed. This is how we
 * create a lack of resources in a world.
 */
const MAX_ENERGY        = (Config.orgCloneEnergy - 1) * (Config.orgAmount >> 1);
/**
 * {Number} This offset will be added to commands value. This is how we
 * add an ability to use numbers in a code, just putting them as command
 */
const CODE_CMD_OFFS     = Config.CODE_CMD_OFFS;
/**
 * {Number} Maximum random generated value
 */
const CODE_MAX_RAND     = CODE_CMD_OFFS + Config.CODE_COMMANDS;
const CODE_STACK_SIZE   = Config.CODE_STACK_SIZE;
/**
 * {Array} Array of increments. Using it we may obtain coordinates of the
 * point depending on one of 8 directions. We use these values in any command
 * related to sight, moving and so on
 */
const DIR               = Config.DIR;
/**
 * {Number} World size. Pay attention, that width and height is -1
 */
const WIDTH             = Config.WORLD_WIDTH - 1;
const HEIGHT            = Config.WORLD_HEIGHT - 1;
const WIDTH1            = WIDTH + 1;
const HEIGHT1           = HEIGHT + 1;
const MAX_OFFS          = WIDTH1 * HEIGHT1 - 1;
const MAX               = Number.MAX_VALUE;

const ORG_MASK          = Config.ORG_MASK;
const ORG_INDEX_MASK    = 0x7fffffff;
const ORG_ATOM_MASK     = 0x000000f0;

const ENERGY_OFF_MASK   = 0xffffff0f;
/**
 * {Number} Max amount of supported surfaces
 */
const SURFACES          = 16;

const ceil              = Math.ceil;
const round             = Math.round;
const rand              = Helper.rand;
const fin               = Number.isFinite;
const abs               = Math.abs;
const nan               = Number.isNaN;

class VM {
    constructor() {
        this.totalOrgsEnergy  = 0;
        this._world           = new World();
        this._surfaces        = this._createSurfaces();
        this._SURFS           = this._surfaces.length;
        this._ENERGY          = this._surfaces[0];
        this._orgs            = null;
        this._iterations      = 0;
        this._population      = 0;
        this._ts              = Date.now();
        this._i               = 0;
        this._diff            = 0;
        this._averageDistance = 0;
        this._averageCodeSize = 0;
        this._averageAmount   = 0;
        if (Config.DB_ON) {
            this._db          = new Db();
            this._db.ready.then(() => this._createOrgs());
        } else {this._createOrgs()}
    }

    destroy() {
        this._world.destroy();
        this._orgs.destroy();
        this._db && this._db.destroy();
        for (let i = 0; i < this._surfaces.length; i++) {this._surfaces[i].destroy()}
        this._surfaces = null;
        this._world    = null;
        this._orgs     = null;
        this._orgs     = null;
        this._db       = null;
    }

    get ready() {
        if (this._db) {
            return this._db.ready;
        }
        return new Promise(resolve => resolve());
    }

    /**
     * Runs code of all organisms Config.codeTimesPerRun time and return. Big
     * times value may slow down user and browser interaction
     */
    run() {
        const times            = Config.codeTimesPerRun;
        const lines            = Config.codeLinesPerIteration;
        const world            = this._world;
        const data             = world.data;
        const stepEnergy       = Config.orgStepEnergy;
        const energyValue      = Config.energyValue;
        const energyMult       = energyValue * Config.orgEnergyMultiplayer;
        const energyClone      = Config.orgCloneEnergy;
        const mutationPeriod   = Config.orgMutationPeriod;
        const maxAge           = Config.orgMaxAge;
        const energyPeriod     = Config.orgEnergyPeriod;
        const cataclysmPeriod  = Config.worldCataclysmEvery;
        const orgs             = this._orgs;
        const orgsRef          = this._orgs.getRef();
        const orgAmount        = Config.orgAmount;
        const orgEatOrgs       = Config.orgEatOrgs;
        //
        // Loop X times through population
        //
        for (let time = 0; time < times; time++) {
            //
            // Loop through population
            //
            let orgsEnergy = 0;
            let o = orgs.first;
            while (o < orgAmount) {
                const org = orgsRef[o++];
                if (org.energy === 0) {continue}

                const code = org.code;
                let   d    = org.d;
                let   a    = org.a;
                let   b    = org.b;
                let   line = org.line;
                //
                // Loop through few lines in one organism to
                // support pseudo multi threading
                //
                for (let l = 0; l < lines; l++) {
                    const cmd = code[line];
                    //
                    // This is ordinary command
                    //
                    if (cmd === CODE_CMD_OFFS) { // step
                        const oldDot = org.dot;
                        if (oldDot !== 0) {
                            const surface = this._surfaces[oldDot % SURFACES];
                            org.energy   -= surface.energy;
                            if (org.energy <= 0) {this._removeOrg(org); l = lines; continue}
                            if ((org.radiation += surface.radiation) >= 1) {org.radiation = 0; Mutations.mutate(org)}
                            if (++org.steps < surface.step + org.moves) {org.energy -= stepEnergy; ++line; continue}
                        } else {
                            if (++org.steps < org.moves) {org.energy -= stepEnergy; ++line; continue}
                        }
                        org.steps = 0;

                        const offset = org.offset + DIR[abs(d << 0) % 8];
                        let   dot;
                        if (offset < 0 || offset > MAX_OFFS || ((dot = data[offset]) & ORG_MASK) !== 0) {++line; continue}
                        //
                        // Organism can't step through stone
                        //
                        if (this._surfaces[dot % SURFACES].barrier) {++line; continue}
                        org.dot = dot;
                        world.moveOrg(org, offset);
                        //
                        // << 28 - dot is an energy
                        //
                        (oldDot & ORG_MASK) !== 0 && (oldDot << 28) === 0 ? world.energy(org.offset, oldDot) : world.dot(org.offset, oldDot);
                        org.energy -= stepEnergy;
                        org.offset = offset;
                        if (org.energy <= 0) {this._removeOrg(org); l = lines}
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 1) { // eat
                        const intd = abs(d << 0);
                        const offset = org.offset + DIR[intd % 8];
                        if (offset < 0 || offset > MAX_OFFS) {b = 0; ++line; continue}
                        const dot  = data[offset];
                        if (dot === 0) {b = 0; ++line; continue}                                       // no energy or out of the world
                        if ((dot & ORG_MASK) !== 0) {                                // other organism
                            if (orgEatOrgs === false) {b = 0; ++line; continue}
                            const nearOrg   = orgsRef[dot & ORG_INDEX_MASK];
                            const energy    = nearOrg.energy <= intd ? nearOrg.energy : intd;
                            nearOrg.energy -= energy;
                            org.energy     += energy;
                            if (nearOrg.energy <= 0) {this._removeOrg(nearOrg); l = lines}
                            b = energy;
                            ++line;
                            continue;
                        }
                        //
                        // << 28 - dot is an energy
                        //
                        if ((dot << 28) === 0) {
                            org.energy += (b = ((((dot & ORG_ATOM_MASK) >>> 4) || 1) * energyMult));
                            this._ENERGY.remove(offset);
                        }
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 2) { // clone
                        if (orgs.full || org.energy < energyClone) {b = 0; ++line; continue}
                        const offset = org.offset + DIR[abs(d << 0) % 8];
                        if (offset < 0 || offset > MAX_OFFS || data[offset] !== 0) {b = 0; ++line; continue}
                        const clone = this._createOrg(offset, orgsRef[orgs.freeIndex], org);
                        org.energy = clone.energy = ceil(org.energy >>> 1);
                        if (org.energy <= 0) {this._removeOrg(org); this._removeOrg(clone); l = lines; b = 0; ++line; continue}
                        if (rand(Config.codeMutateEveryClone) === 0) {Mutations.mutate(clone)}
                        if (rand(Config.codeCrossoverEveryClone) === 0) {const org2 = orgsRef[rand(orgs.size)]; org2 !== null && Mutations.crossover(clone, org2)}
                        b = 1;
                        this._db && this._db.put(clone, org);
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 3) { // see
                        const offset = org.offset + DIR[abs(d << 0) % 8] + (a << 0);
                        if (offset < 0 || offset > MAX_OFFS) {d = 0; ++line; continue}
                        const dot  = data[offset];
                        if ((dot & ORG_MASK) !== 0) {d = (orgsRef[dot & ORG_INDEX_MASK]).energy; d = 0; ++line; continue}    // other organism
                        d = dot;                                                    // some world object
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 4) {  // dtoa
                        a = d;
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 5) {  // dtob
                        b = d;
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 6) {  // atod
                        d = a;
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 7) {  // atob
                        b = a;
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 8) {  // add
                        d = a + b;
                        if (!fin(d)) {d = MAX}
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 9) {  // sub
                        d = a - b;
                        if (!fin(d)) {d = -MAX}
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 10) { // mul
                        d = a * b;
                        if (!fin(d)) {d = MAX}
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 11) { // div
                        d = a / b;
                        if (!fin(d) || nan(d)) {d = 0}
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 12) { // inc
                        if (!fin(++d)) {d = MAX}
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 13) { // dec
                        if (!fin(--d)) {d = -MAX}
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 14) {// loop
                        const LOOPS = org.loops;
                        if (LOOPS[line] < 0 && org.offs[line] > line + 1) {LOOPS[line] = abs(d)}
                        if (--LOOPS[line] < 0) {
                            line = org.offs[line];
                            continue;
                        }
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 15) {// ifdga
                        if (d > a) {line++}
                        else {line = org.offs[line]}
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 16) {// ifdla
                        if (d < a) {line++}
                        else {line = org.offs[line]}
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 17) {// ifdea
                        if (d === a) {line++}
                        else {line = org.offs[line]}
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 18) {// nop
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 19) {// mget
                        const inta = abs(a << 0);
                        if (inta >= org.mem.length) {++line; continue}
                        d = org.mem[inta];
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 20) {// mput
                        const inta = abs(a << 0);
                        if (inta >= org.mem.length) {++line; continue}
                        org.mem[inta] = d;
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 21) {// offs
                        d = org.offset;
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 22) { // rand
                        a = rand(CODE_MAX_RAND * 2) - CODE_MAX_RAND;
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 23) {// call
                        if (org.fCount === 0) {++line; continue}
                        let   index = org.stackIndex;
                        if (index >= CODE_STACK_SIZE * 5) {index = -1}
                        const func  = abs(d << 0) % org.fCount;
                        const stack = org.stack;
                        stack[++index] = line + 1;
                        stack[++index] = d;
                        stack[++index] = a;
                        stack[++index] = b;
                        const end = org.offs[org.funcs[func] - 1] - 1;
                        stack[++index] = end <= 0 ? code.length : end;
                        line = org.funcs[func];
                        org.stackIndex = index;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 24) { // func
                        line = org.offs[line];
                        if (line === 0 && org.stackIndex >= 0) {
                            const stack = org.stack;
                            b = stack[3];
                            a = stack[2];
                            d = stack[1];
                            line = stack[0];
                            org.stackIndex = -1;
                        }
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 25) {// ret
                        const stack = org.stack;
                        let   index = org.stackIndex;
                        if (index < 0) {++line; continue}
                        index--;              // we have to skip func end line
                        b    = stack[index--];
                        a    = stack[index--];
                        index--;              // we have to skip d register to return it
                        line = stack[index--];
                        org.stackIndex = index;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 26) {// end
                        switch (code[org.offs[line]]) {
                            case CODE_CMD_OFFS + 14: // loop
                                line = org.offs[line];
                                break;
                            case CODE_CMD_OFFS + 25: // func
                                const stack = org.stack;
                                let index = org.stackIndex;
                                if (index < 0) {break}
                                index--;
                                b = stack[index--];
                                a = stack[index--];
                                d = stack[index--];
                                line = stack[index--];
                                org.stackIndex = index;
                                break;
                            default:
                                ++line;
                                break;
                        }
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 27) {// get
                        if (org.packet !== 0) {b = 0; ++line; continue}
                        const offset = org.offset + DIR[abs(d << 0) % 8];
                        let dot;
                        let surf;
                        if (offset < 0 || offset > MAX_OFFS || (dot = data[offset]) === 0 || (dot & ORG_MASK) !== 0 || !(surf = this._surfaces[dot % SURFACES]).get) {b = 0; ++line; continue}
                        org.packet = b = dot;
                        surf.remove(offset, true);
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 28) {// put
                        if (org.packet === 0) {++line; continue}
                        const offset = org.offset + DIR[abs(d << 0) % 8];
                        if (offset < 0 || offset > MAX_OFFS || data[offset] !== 0) {++line; continue}
                        this._world.dot(offset, b = org.packet);
                        org.packet = 0;
                        ++line;
                        continue;
                    }

                    if (cmd === CODE_CMD_OFFS + 29) {// mix
                        const packet = org.packet;
                        if (packet === 0) {b = 0; ++line; continue}
                        const offset = org.offset + DIR[abs(d << 0) % 8];
                        let   dot;
                        //
                        // << 28 - dot is an energy
                        //
                        if (offset < 0 || offset > MAX_OFFS || (dot = data[offset]) === 0 || (dot & ORG_MASK) !== 0 || (dot << 28) !== 0 || (packet << 28) !== 0) {b = 0; ++line; continue}
                        const atom1 = ((dot & ORG_ATOM_MASK) >>> 4) || 1;
                        const atom2 = ((packet & ORG_ATOM_MASK) >>> 4) || 1;
                        org.packet = 0;
                        //
                        // This remove() must be before dot()
                        //
                        this._ENERGY.remove(offset);
                        this._world.dot(offset, b = (dot & ENERGY_OFF_MASK | (atom1 + atom2) << 4));
                        ++line;
                        continue;
                    }
                    //
                    // This is a number command: d = N
                    //
                    if (cmd < CODE_CMD_OFFS && cmd > -CODE_CMD_OFFS) {d = cmd; ++line; continue}
                    //
                    // We are on the last code line. Have to jump to the first
                    //
                    if (line >= code.length) {
                        if (org.stackIndex >= 0) {
                            const stack = org.stack;
                            b    = stack[3];
                            a    = stack[2];
                            d    = stack[1];
                            line = stack[0];
                            org.stackIndex = -1;
                        } else {
                            line = 0;
                        }
                    }
                }
                org.line = line;
                org.d    = d;
                org.a    = a;
                org.b    = b;
                //
                // Organism age related updates
                //
                const age = org.age;
                if (age % org.period === 0 && age > 0 && mutationPeriod > 0) {Mutations.mutate(org)}
                if (age % maxAge === 0 && age > 0) {this._removeOrg(org)}
                if (age % energyPeriod === 0 && energyPeriod > 0) {
                    //
                    // Energy waste depends on energy amount. Big (more energy) organism spends more energy
                    //
                    org.energy--;
                    if (org.energy <= 0) {this._removeOrg(org)}
                }
                if ((this.totalOrgsEnergy + this._ENERGY.curAmount * energyValue) < MAX_ENERGY) {this._ENERGY.put()}
                //
                // This mechanism runs surfaces moving (energy, lava, holes, water, sand)
                //
                for (let s = 0, sLen = this._SURFS; s < sLen; s++) {
                    const surface = this._surfaces[s];
                    if (surface.curDelay++ >= surface.delay) {
                        surface.move();
                        surface.curDelay = 0;
                    }
                }

                org.age++;
                this._i += lines;
                orgsEnergy += org.energy;
            }
            //
            // Global cataclysm logic. If global similarity is more then 30%, then this
            // mechanism start working. 30% of all organisms will be removed and new random
            // generated organisms will be created
            //
            if (this._iterations % cataclysmPeriod === 0) {this._updateCataclysm(orgs)}

            this.totalOrgsEnergy = orgsEnergy;
            this._iterations++;
        }
        //
        // Updates status line at the top of screen
        //
        const ts = Date.now();
        if (ts - this._ts > 1000) {
            const orgAmount = orgs.items;
            world.title(`inps:${round(((this._i / orgAmount) / (((ts - this._ts) || 1)) * 1000))} orgs:${orgAmount} onrg:${(this.totalOrgsEnergy / orgAmount) << 0} diff:${this._diff} gen:${this._population}`);
            this._ts = ts;
            this._i  = 0;

            if (orgs.items === 0) {this._createOrgs()}
        }
    }

    _updateCataclysm(orgs) {
        const org1 = orgs.get(rand(orgs.size));
        const org2 = orgs.get(rand(orgs.size));
        const data = this._world.data;
        if (org1 !== null && org2 !== null) {
            this._averageDistance += Helper.distance(org1.code, org2.code);
            this._averageCodeSize += ceil((org1.code.length + org2.code.length) / 2);
            if (this._iterations > 100) {
                this._diff = round(((this._averageDistance / this._averageAmount) / (this._averageCodeSize / this._averageAmount)) * 100) / 100;
            }
            if (++this._averageAmount > (Config.orgAmount * .3)) {
                this._diff = round(((this._averageDistance / this._averageAmount) / (this._averageCodeSize / this._averageAmount)) * 100) / 100;
                if (this._diff < Config.worldOrgsSimilarityPercent) {
                    for (let i = 0, orgAmount = ceil(orgs.items * Config.worldOrgsSimilarityPercent); i < orgAmount; i++) {
                        const org2Kill = orgs.get(i);
                        if (org2Kill === null) {orgAmount++; continue}
                        const offset = rand(MAX_OFFS);
                        if (data[offset] === 0) {
                            this._removeOrg(org2Kill);
                            const org = this._createOrg(offset, org2Kill);
                            this._db && this._db.put(org);
                        }
                    }
                }
                this._averageAmount   = 0;
                this._averageDistance = 0;
                this._averageCodeSize = 0;
            }
        }
    }

    _removeOrg(org) {
        const offset = org.offset;
        const packet = org.packet;

        org.energy = 0;
        this._orgs.del(org.item, false);
        this._world.empty(offset);
        this._world.dot(offset, org.dot);
        this._surfaces[packet % SURFACES].put(packet, false);
    }

    /**
     * Creates organisms population according to Config.orgAmount amount.
     * Organisms will be placed randomly in a world
     */
    _createOrgs() {
        const world     = this._world;
        const data      = world.data;
        let   orgAmount = Config.orgAmount;

        this._orgs = new FastArray(orgAmount);
        //
        // Only quarter of the population will be created on the beginning
        //
        orgAmount >>>= 2;
        while (orgAmount > 0) {
            const offset = rand(MAX_OFFS);
            if (data[offset] === 0) {
                const org = this._createOrg(offset);
                this._db && this._db.put(org);
                orgAmount--;
            }
        }
        this._population++;
    }

    /**
     * Creates one organism with default parameters and empty code
     * @param {Number} offset Absolute org offset
     * @param {Organism=} deadOrg Dead organism we may replace by new one
     * @param {Organism=} parent Create from parent
     * @returns {Object} Item in FastArray class
     */
    _createOrg(offset, deadOrg = undefined, parent = null) {
        const orgs = this._orgs;
        const org  = deadOrg && deadOrg.init(Helper.id(), offset, this, deadOrg.item, Config.orgEnergy, parent) ||
                     new Organism(Helper.id(), offset, this, orgs.freeIndex, Config.orgEnergy, parent);

        orgs.add(org);
        this._world.org(offset, org);

        return org;
    }

    _createSurfaces() {
        const SURFS  = Config.worldSurfaces;
        const AMOUNT = SURFS.length ;

        const surfaces = new Array(AMOUNT);
        for (let i = 0; i < AMOUNT; i++) {
            surfaces[i] = new Surface(SURFS[i], i, this._world);
        }

        return surfaces;
    }
}

module.exports = VM;