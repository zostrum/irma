/**
 * Global helper
 *
 * @author flatline
 */
const _each = require('lodash/each');

class Helper {
    /**
     * Generates random Int number in range 0:n-1
     * @param {Number} n Right number value in a range
     * @return {Number}
     */
    static rand(n) {return Math.trunc(Math.random() * n)}
    /**
     * Apply styles packed in object. key: style name, val: style value
     * @param {Element|String} el Element to apply styles or tag name to create
     * @param {Object} styles Styles object
     * @return {Element} Element with applied styles
     */
    static setStyles(el, styles) {
        el = typeof el === 'string' ? document.createElement(el) : el;
        const style = el.style;

        _each(styles, (val, name) => style[name] = val);

        return el;
    }
}

module.exports = Helper;