/**
 * Canvas implementation with minimum logic for drawing colored dots.
 *
 * @author flatline
 */
const Panzoom  = require('panzoom');
const Helper   = require('./../common/Helper');
const Config   = require('./../Config');

class Canvas {
    constructor(width, height) {
        const id  = 'world';
        const doc = document;

        doc.body.innerHTML += `<canvas id="${id}" width="${width}" height="${height}"></canvas>`;

        this._width         = width;
        this._height        = height;
        this._canvasEl      = doc.querySelector('#' + id);
        this._headerEl      = this._createHeader();
        this._ctx           = this._canvasEl.getContext('2d');
        this._imgData       = this._ctx.createImageData(this._width, this._height);
        this._data          = this._imgData.data;
        this._animate       = this._onAnimate.bind(this);
        this._visualize     = true;
        this._panZoom       = null;
        this._zoomObserver  = null;
        this._fullEl        = this._createFullScreenBtn();
        this._visualizeEl   = this._createVisualizeBtn();
        this._xDataOffs     = 0;
        this._yDataOffs     = 0;
        this._visibleWidth  = Config.worldWidth;
        this._visibleHeight = Config.worldHeight;

        this._prepareDom();
        this._initPanZoomLib();
        this.clear();
        this._onFullscreen();
        window.requestAnimationFrame(this._animate);
    }

    destroy() {
        const parentNode = this._canvasEl.parentNode;

        this._panZoom.dispose();
        parentNode.removeChild(this._canvasEl);
        parentNode.removeChild(this._fullEl);
        parentNode.removeChild(this._visualizeEl);
        this._headerEl.parentNode.removeChild(this._headerEl);
        this._headerEl    = null;
        this._canvasEl    = null;
        this._fullEl      = null;
        this._visualizeEl = null;
        this._ctx         = null;
        this._imgData     = null;
        this._data        = null;
    }

    visualize(visualize = true) {
        this._visualize = visualize;
        this._onVisualize(visualize);
        this._onAnimate();
    }

    /**
     * Sets pixel to specified color with specified coordinates.
     * Color should contain red, green and blue components in one
     * decimal number. For example: 16777215 is #FFFFFF - white.
     * In case of invalid coordinates 0 value for x, color and y will
     * be used.
     * @param {Number} x X coordinate
     * @param {Number} y Y coordinate
     * @param {Number} color Decimal color
     */
    dot(x, y, color) {
        const data = this._data;
        const offs = (y * this._width + x) * 4;

        data[offs    ] = (color >> 16) & 0xff;
        data[offs + 1] = (color >> 8)  & 0xff;
        data[offs + 2] = color & 0xff;
    }

    /**
     * Sets pixel with 0 color with specified coordinates.
     * @param {Number} x X coordinate
     * @param {Number} y Y coordinate
     */
    empty(x, y) {
        const data = this._data;
        const offs = (y * this._width + x) * 4;
        data[offs] = data[offs + 1] = data[offs + 2] = 0;
    }

    /**
     * This method is optimized for speed. It contains code duplication
     * with dot() method.
     * @param {Number} x0 Start X position
     * @param {Number} y0 Start Y position
     * @param {Number} x1 End X position
     * @param {Number} y1 End Y position
     * @param {Number} color
     */
    move(x0, y0, x1, y1, color) {
        const data  = this._data;
        const offs0 = (y0 * this._width + x0) * 4;
        const offs1 = (y1 * this._width + x1) * 4;

        data[offs0] = data[offs0 + 1] = data[offs0 + 2] = 0;

        data[offs1    ] = (color >> 16) & 0xff;
        data[offs1 + 1] = (color >> 8)  & 0xff;
        data[offs1 + 2] = color & 0xff;
    }

    /**
     * Clears canvas with black color
     */
    clear() {
        const size = this._width * this._height * 4;
        const data = this._data;

        for (let i = 0; i < size; i += 4) {
            data[i + 3] = 0xff;
        }
    }

    header(text) {
        this._headerEl.textContent = text;
    }

    _createFullScreenBtn() {
        const el = document.body.appendChild(Helper.setStyles('DIV', {
            position       : 'absolute',
            width          : '20px',
            height         : '20px',
            top            : '7px',
            left           : '7px',
            border         : '1px #000 solid',
            backgroundColor: '#f7ed0e',
            borderRadius   : '6px',
            cursor         : 'pointer'
        }));
        //
        // Inner div
        //
        const innerEl = document.body.appendChild(Helper.setStyles('DIV', {
            position       : 'absolute',
            width          : '10px',
            height         : '10px',
            top            : '12px',
            left           : '12px',
            border         : '1px #000 solid',
            backgroundColor: '#f7ed0e',
            borderRadius   : '3px',
            cursor         : 'pointer'
        }));

        el.title        = 'fullscreen (Ctrl-F)';
        el.onclick      = this._onFullscreen.bind(this);
        innerEl.onclick = this._onFullscreen.bind(this);

        return el;
    }

    _createVisualizeBtn() {
        const el = document.body.appendChild(Helper.setStyles('DIV', {
            position       : 'absolute',
            width          : '20px',
            height         : '20px',
            top            : '7px',
            left           : '34px',
            border         : '1px #FFEB3B solid',
            backgroundSize : '8px 8px',
            borderRadius   : '6px',
            background     : 'radial-gradient(#F44336 15%, transparent 16%) 0 0, radial-gradient(#F44336 15%, transparent 16%) 4px 4px, radial-gradient(rgba(255,255,253,.1) 15%, transparent 20%) 0 1px, radial-gradient(rgba(255,255,255,.1) 15%, transparent 20%) 8px 8px',
            backgroundColor: '#FFEB3B',
            cursor         : 'pointer'
        }));

        el.title   = 'visualize (Ctrl-V)';
        el.onclick = this._onVisualize.bind(this);

        return el;
    }

    _onFullscreen() {
        this._panZoom.zoomAbs(0, 0, 1.0);
        this._panZoom.moveTo(0, 0);
        this._canvasEl.style.width  = '100%';
        this._canvasEl.style.height = '100%';
    }

    _onVisualize(visualize) {
        this._visualize = typeof(visualize) === 'boolean' ? visualize : !this._visualize;
        this._visualizeEl.style.backgroundColor = this._visualize ? '#FFEB3B' : '#000';
        this._onAnimate();
    }

    _onAnimate() {
        this._ctx.putImageData(this._imgData, 0, 0, this._xDataOffs, this._yDataOffs, this._visibleWidth, this._visibleHeight);

        if (this._visualize === true) {
            window.requestAnimationFrame(this._animate);
        }
    }

    _prepareDom() {
        const bodyEl = document.body;
        const htmlEl = document.querySelector('html');

        Helper.setStyles(bodyEl, {
            width          : '100%',
            height         : '100%',
            margin         : 0,
            backgroundColor: '#9e9e9e'
        });
        Helper.setStyles(htmlEl, {
            width          : '100%',
            height         : '100%',
            margin         : 0
        });

        this._ctx.font      = "18px Consolas";
        this._ctx.fillStyle = "white";
        //
        // This style hides scroll bars on full screen 2d canvas
        //
        document.querySelector('html').style.overflow = 'hidden';
        //
        // Adds listener to change of canvas transform matrix. We need it
        // to handle zooming of the canvas
        //
        this._zoomObserver = new MutationObserver(this._onZoom.bind(this));
        this._zoomObserver.observe(this._canvasEl, {
            attributes     : true,
            childList      : false,
            attributeFilter: ['style']
        });
        //
        // Global keyup event handler
        //
        document.addEventListener('keydown', this._onKeyDown.bind(this));
    }

    _createHeader() {
        return document.body.appendChild(Helper.setStyles('DIV', {
            position  : 'absolute',
            top       : '7px',
            left      : '60px',
            color     : '#fff',
            fontSize  : '18px',
            fontFamily: 'Consolas'
        }));
    }

    _onKeyDown(event) {
        if (event.ctrlKey && (event.key === 'V' || event.key === 'v')){
            this._onVisualize();
            event.preventDefault();
            return false;
        } else if (event.ctrlKey && (event.key === 'F' || event.key === 'f')) {
            this._onFullscreen();
            event.preventDefault();
            return false;
        }
    }

    /**
     * Initializes 'panzoom' library, which adds possibility to
     * zoom and scroll canvas by mouse. imageRendering css property
     * removes smooth effect while zooming
     */
    _initPanZoomLib() {
        this._canvasEl.style.imageRendering = 'pixelated';
        this._panZoom   = Panzoom(this._canvasEl, {
            zoomSpeed   : Config.worldZoomSpeed,
            smoothScroll: false
        });
        this._panZoom.zoomAbs(0, 0, 1.0);
    }

    /**
     * Is called on canvas zoom/move change. This method improves rendering
     * speed of big canvases. It copies only visible part of the canvas from
     * memory (see this._imgData).
     */
    _onZoom() {
        const transform     = window.getComputedStyle(this._canvasEl, null).getPropertyValue('transform');
        if (transform === 'none') {return}
        const matrix        = transform.split('(')[1].split(')')[0].split(',');
        const dx            = +matrix[4];
        const dy            = +matrix[5];
        const coef          = +matrix[0];
        const windowWidth   = window.innerWidth;
        const windowHeight  = window.innerHeight;
        const viewWidth     = windowWidth  * coef;
        const viewHeight    = windowHeight * coef;
        const xCoef         = Config.worldWidth  / windowWidth;
        const yCoef         = Config.worldHeight / windowHeight;

        this._xDataOffs = (dx < 0 ? (coef > 1 ? -dx / coef : -dx * coef) : 0) * xCoef;
        this._yDataOffs = (dy < 0 ? (coef > 1 ? -dy / coef : -dy * coef) : 0) * yCoef;

        this._visibleWidth  = (viewWidth  + dx > windowWidth  ? (coef > 1 ? (windowWidth  - (dx > 0 ? dx : 0)) / coef : (windowWidth  - (dx > 0 ? dx : 0)) * coef) : windowWidth) * xCoef;
        this._visibleHeight = (viewHeight + dy > windowHeight ? (coef > 1 ? (windowHeight - (dy > 0 ? dy : 0)) / coef : (windowHeight - (dy > 0 ? dy : 0)) * coef) : windowWidth) * yCoef;
    }
}

module.exports = Canvas;