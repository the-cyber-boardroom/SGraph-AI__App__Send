/* =============================================================================
   SGraph Send Admin Console — QR Code Generator
   v0.1.3 — Zero-dependency QR code encoder with SVG output

   Based on Nayuki's QR Code generator library (MIT License)
   Copyright (c) Project Nayuki. https://www.nayuki.io/page/qr-code-generator-library

   Permission is hereby granted, free of charge, to any person obtaining a copy of
   this software and associated documentation files (the "Software"), to deal in
   the Software without restriction, including without limitation the rights to
   use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
   the Software, and to permit persons to whom the Software is furnished to do so,
   subject to the following conditions:
   - The above copyright notice and this permission notice shall be included in
     all copies or substantial portions of the Software.
   - The Software is provided "as is", without warranty of any kind, express or
     implied, including but not limited to the warranties of merchantability,
     fitness for a particular purpose and noninfringement.

   API:
     window.sgraphAdmin.qr.toSvg(text, options)  → SVG markup string
     window.sgraphAdmin.qr.toDataUrl(text, options) → data:image/svg+xml URL
   ============================================================================= */

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // QR Code encoder core (adapted from Nayuki's TypeScript implementation)
    // ═══════════════════════════════════════════════════════════════════════════

    function appendBits(val, len, bb) {
        if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError('Value out of range');
        for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
    }

    function getBit(x, i) { return ((x >>> i) & 1) !== 0; }
    function assert(cond) { if (!cond) throw new Error('Assertion error'); }

    // ─── Error Correction Level ────────────────────────────────────────────
    class Ecc {
        constructor(ordinal, formatBits) { this.ordinal = ordinal; this.formatBits = formatBits; }
    }
    Ecc.LOW      = new Ecc(0, 1);
    Ecc.MEDIUM   = new Ecc(1, 0);
    Ecc.QUARTILE = new Ecc(2, 3);
    Ecc.HIGH     = new Ecc(3, 2);

    // ─── Segment Mode ──────────────────────────────────────────────────────
    class Mode {
        constructor(modeBits, numBitsCharCount) { this.modeBits = modeBits; this._numBitsCharCount = numBitsCharCount; }
        numCharCountBits(ver) { return this._numBitsCharCount[Math.floor((ver + 7) / 17)]; }
    }
    Mode.NUMERIC      = new Mode(0x1, [10, 12, 14]);
    Mode.ALPHANUMERIC = new Mode(0x2, [ 9, 11, 13]);
    Mode.BYTE         = new Mode(0x4, [ 8, 16, 16]);
    Mode.KANJI        = new Mode(0x8, [ 8, 10, 12]);
    Mode.ECI          = new Mode(0x7, [ 0,  0,  0]);

    const NUMERIC_REGEX      = /^[0-9]*$/;
    const ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+.\/:-]*$/;
    const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

    // ─── QR Segment ────────────────────────────────────────────────────────
    class QrSegment {
        constructor(mode, numChars, bitData) {
            if (numChars < 0) throw new RangeError('Invalid argument');
            this.mode     = mode;
            this.numChars = numChars;
            this._bitData = bitData.slice();
        }

        getData() { return this._bitData.slice(); }

        static makeBytes(data) {
            const bb = [];
            for (const b of data) appendBits(b, 8, bb);
            return new QrSegment(Mode.BYTE, data.length, bb);
        }

        static makeNumeric(digits) {
            if (!NUMERIC_REGEX.test(digits)) throw new RangeError('Non-numeric characters');
            const bb = [];
            for (let i = 0; i < digits.length; ) {
                const n = Math.min(digits.length - i, 3);
                appendBits(parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
                i += n;
            }
            return new QrSegment(Mode.NUMERIC, digits.length, bb);
        }

        static makeAlphanumeric(text) {
            if (!ALPHANUMERIC_REGEX.test(text)) throw new RangeError('Unencodable characters');
            const bb = [];
            let i;
            for (i = 0; i + 2 <= text.length; i += 2) {
                let temp = ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
                temp += ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
                appendBits(temp, 11, bb);
            }
            if (i < text.length) appendBits(ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
            return new QrSegment(Mode.ALPHANUMERIC, text.length, bb);
        }

        static makeSegments(text) {
            if (text === '')                          return [];
            else if (NUMERIC_REGEX.test(text))        return [QrSegment.makeNumeric(text)];
            else if (ALPHANUMERIC_REGEX.test(text))   return [QrSegment.makeAlphanumeric(text)];
            else                                      return [QrSegment.makeBytes(QrSegment.toUtf8ByteArray(text))];
        }

        static getTotalBits(segs, version) {
            let result = 0;
            for (const seg of segs) {
                const ccbits = seg.mode.numCharCountBits(version);
                if (seg.numChars >= (1 << ccbits)) return Infinity;
                result += 4 + ccbits + seg._bitData.length;
            }
            return result;
        }

        static toUtf8ByteArray(str) {
            str = encodeURI(str);
            const result = [];
            for (let i = 0; i < str.length; i++) {
                if (str.charAt(i) !== '%') result.push(str.charCodeAt(i));
                else { result.push(parseInt(str.substring(i + 1, i + 3), 16)); i += 2; }
            }
            return result;
        }
    }

    // ─── ECC & Block Tables ────────────────────────────────────────────────
    const ECC_CODEWORDS_PER_BLOCK = [
        [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
        [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    ];

    const NUM_ERROR_CORRECTION_BLOCKS = [
        [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
        [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
        [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
        [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
    ];

    const PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

    // ─── QR Code ───────────────────────────────────────────────────────────
    class QrCode {

        static encodeText(text, ecl) {
            return QrCode.encodeSegments(QrSegment.makeSegments(text), ecl);
        }

        static encodeSegments(segs, ecl, minVersion, maxVersion, mask, boostEcl) {
            if (minVersion === undefined) minVersion = 1;
            if (maxVersion === undefined) maxVersion = 40;
            if (mask       === undefined) mask = -1;
            if (boostEcl   === undefined) boostEcl = true;

            if (!(1 <= minVersion && minVersion <= maxVersion && maxVersion <= 40) || mask < -1 || mask > 7)
                throw new RangeError('Invalid value');

            let version, dataUsedBits;
            for (version = minVersion; ; version++) {
                const dataCapacityBits = QrCode._getNumDataCodewords(version, ecl) * 8;
                const usedBits = QrSegment.getTotalBits(segs, version);
                if (usedBits <= dataCapacityBits) { dataUsedBits = usedBits; break; }
                if (version >= maxVersion) throw new RangeError('Data too long');
            }

            for (const newEcl of [Ecc.MEDIUM, Ecc.QUARTILE, Ecc.HIGH]) {
                if (boostEcl && dataUsedBits <= QrCode._getNumDataCodewords(version, newEcl) * 8)
                    ecl = newEcl;
            }

            let bb = [];
            for (const seg of segs) {
                appendBits(seg.mode.modeBits, 4, bb);
                appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
                for (const b of seg.getData()) bb.push(b);
            }
            assert(bb.length === dataUsedBits);

            const dataCapacityBits = QrCode._getNumDataCodewords(version, ecl) * 8;
            assert(bb.length <= dataCapacityBits);
            appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
            appendBits(0, (8 - bb.length % 8) % 8, bb);
            assert(bb.length % 8 === 0);

            for (let padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11)
                appendBits(padByte, 8, bb);

            const dataCodewords = [];
            while (dataCodewords.length * 8 < bb.length) dataCodewords.push(0);
            bb.forEach((b, i) => { dataCodewords[i >>> 3] |= b << (7 - (i & 7)); });

            return new QrCode(version, ecl, dataCodewords, mask);
        }

        constructor(version, ecl, dataCodewords, msk) {
            if (version < 1 || version > 40) throw new RangeError('Version out of range');
            if (msk < -1 || msk > 7)         throw new RangeError('Mask out of range');

            this.version              = version;
            this.errorCorrectionLevel = ecl;
            this.size                 = version * 4 + 17;
            this.modules              = [];
            this._isFunction          = [];

            const row = [];
            for (let i = 0; i < this.size; i++) row.push(false);
            for (let i = 0; i < this.size; i++) {
                this.modules.push(row.slice());
                this._isFunction.push(row.slice());
            }

            this._drawFunctionPatterns();
            const allCodewords = this._addEccAndInterleave(dataCodewords);
            this._drawCodewords(allCodewords);

            if (msk === -1) {
                let minPenalty = 1000000000;
                for (let i = 0; i < 8; i++) {
                    this._applyMask(i);
                    this._drawFormatBits(i);
                    const penalty = this._getPenaltyScore();
                    if (penalty < minPenalty) { msk = i; minPenalty = penalty; }
                    this._applyMask(i);
                }
            }
            assert(0 <= msk && msk <= 7);
            this.mask = msk;
            this._applyMask(msk);
            this._drawFormatBits(msk);
            this._isFunction = [];
        }

        getModule(x, y) {
            return 0 <= x && x < this.size && 0 <= y && y < this.size && this.modules[y][x];
        }

        // ─── Drawing function modules ──────────────────────────────────

        _drawFunctionPatterns() {
            for (let i = 0; i < this.size; i++) {
                this._setFunctionModule(6, i, i % 2 === 0);
                this._setFunctionModule(i, 6, i % 2 === 0);
            }
            this._drawFinderPattern(3, 3);
            this._drawFinderPattern(this.size - 4, 3);
            this._drawFinderPattern(3, this.size - 4);

            const alignPatPos = this._getAlignmentPatternPositions();
            const numAlign = alignPatPos.length;
            for (let i = 0; i < numAlign; i++) {
                for (let j = 0; j < numAlign; j++) {
                    if (!(i === 0 && j === 0 || i === 0 && j === numAlign - 1 || i === numAlign - 1 && j === 0))
                        this._drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
                }
            }
            this._drawFormatBits(0);
            this._drawVersion();
        }

        _drawFormatBits(mask) {
            const data = this.errorCorrectionLevel.formatBits << 3 | mask;
            let rem = data;
            for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
            const bits = (data << 10 | rem) ^ 0x5412;
            assert(bits >>> 15 === 0);

            for (let i = 0; i <= 5; i++) this._setFunctionModule(8, i, getBit(bits, i));
            this._setFunctionModule(8, 7, getBit(bits, 6));
            this._setFunctionModule(8, 8, getBit(bits, 7));
            this._setFunctionModule(7, 8, getBit(bits, 8));
            for (let i = 9; i < 15; i++) this._setFunctionModule(14 - i, 8, getBit(bits, i));

            for (let i = 0; i < 8; i++) this._setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
            for (let i = 8; i < 15; i++) this._setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
            this._setFunctionModule(8, this.size - 8, true);
        }

        _drawVersion() {
            if (this.version < 7) return;
            let rem = this.version;
            for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
            const bits = this.version << 12 | rem;
            assert(bits >>> 18 === 0);
            for (let i = 0; i < 18; i++) {
                const color = getBit(bits, i);
                const a = this.size - 11 + i % 3;
                const b = Math.floor(i / 3);
                this._setFunctionModule(a, b, color);
                this._setFunctionModule(b, a, color);
            }
        }

        _drawFinderPattern(x, y) {
            for (let dy = -4; dy <= 4; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    const dist = Math.max(Math.abs(dx), Math.abs(dy));
                    const xx = x + dx, yy = y + dy;
                    if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size)
                        this._setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
                }
            }
        }

        _drawAlignmentPattern(x, y) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++)
                    this._setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
        }

        _setFunctionModule(x, y, isDark) {
            this.modules[y][x] = isDark;
            this._isFunction[y][x] = true;
        }

        // ─── Codewords and masking ─────────────────────────────────────

        _addEccAndInterleave(data) {
            const ver = this.version;
            const ecl = this.errorCorrectionLevel;
            if (data.length !== QrCode._getNumDataCodewords(ver, ecl)) throw new RangeError('Invalid argument');

            const numBlocks     = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
            const blockEccLen   = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
            const rawCodewords  = Math.floor(QrCode._getNumRawDataModules(ver) / 8);
            const numShortBlocks = numBlocks - rawCodewords % numBlocks;
            const shortBlockLen  = Math.floor(rawCodewords / numBlocks);

            const blocks = [];
            const rsDiv = QrCode._reedSolomonComputeDivisor(blockEccLen);
            for (let i = 0, k = 0; i < numBlocks; i++) {
                const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
                k += dat.length;
                const ecc = QrCode._reedSolomonComputeRemainder(dat, rsDiv);
                if (i < numShortBlocks) dat.push(0);
                blocks.push(dat.concat(ecc));
            }

            const result = [];
            for (let i = 0; i < blocks[0].length; i++) {
                blocks.forEach((block, j) => {
                    if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks)
                        result.push(block[i]);
                });
            }
            assert(result.length === rawCodewords);
            return result;
        }

        _drawCodewords(data) {
            if (data.length !== Math.floor(QrCode._getNumRawDataModules(this.version) / 8))
                throw new RangeError('Invalid argument');
            let i = 0;
            for (let right = this.size - 1; right >= 1; right -= 2) {
                if (right === 6) right = 5;
                for (let vert = 0; vert < this.size; vert++) {
                    for (let j = 0; j < 2; j++) {
                        const x = right - j;
                        const upward = ((right + 1) & 2) === 0;
                        const y = upward ? this.size - 1 - vert : vert;
                        if (!this._isFunction[y][x] && i < data.length * 8) {
                            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
                            i++;
                        }
                    }
                }
            }
            assert(i === data.length * 8);
        }

        _applyMask(mask) {
            if (mask < 0 || mask > 7) throw new RangeError('Mask out of range');
            for (let y = 0; y < this.size; y++) {
                for (let x = 0; x < this.size; x++) {
                    let invert;
                    switch (mask) {
                        case 0: invert = (x + y) % 2 === 0;                                  break;
                        case 1: invert = y % 2 === 0;                                        break;
                        case 2: invert = x % 3 === 0;                                        break;
                        case 3: invert = (x + y) % 3 === 0;                                  break;
                        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;  break;
                        case 5: invert = x * y % 2 + x * y % 3 === 0;                        break;
                        case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0;                  break;
                        case 7: invert = ((x + y) % 2 + x * y % 3) % 2 === 0;                break;
                        default: throw new Error('Unreachable');
                    }
                    if (!this._isFunction[y][x] && invert)
                        this.modules[y][x] = !this.modules[y][x];
                }
            }
        }

        _getPenaltyScore() {
            let result = 0;
            for (let y = 0; y < this.size; y++) {
                let runColor = false, runX = 0, runHistory = [0,0,0,0,0,0,0];
                for (let x = 0; x < this.size; x++) {
                    if (this.modules[y][x] === runColor) {
                        runX++;
                        if (runX === 5) result += PENALTY_N1;
                        else if (runX > 5) result++;
                    } else {
                        this._finderPenaltyAddHistory(runX, runHistory);
                        if (!runColor) result += this._finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
                        runColor = this.modules[y][x]; runX = 1;
                    }
                }
                result += this._finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3;
            }
            for (let x = 0; x < this.size; x++) {
                let runColor = false, runY = 0, runHistory = [0,0,0,0,0,0,0];
                for (let y = 0; y < this.size; y++) {
                    if (this.modules[y][x] === runColor) {
                        runY++;
                        if (runY === 5) result += PENALTY_N1;
                        else if (runY > 5) result++;
                    } else {
                        this._finderPenaltyAddHistory(runY, runHistory);
                        if (!runColor) result += this._finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
                        runColor = this.modules[y][x]; runY = 1;
                    }
                }
                result += this._finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3;
            }

            for (let y = 0; y < this.size - 1; y++) {
                for (let x = 0; x < this.size - 1; x++) {
                    const c = this.modules[y][x];
                    if (c === this.modules[y][x+1] && c === this.modules[y+1][x] && c === this.modules[y+1][x+1])
                        result += PENALTY_N2;
                }
            }

            let dark = 0;
            for (const row of this.modules) dark = row.reduce((s, c) => s + (c ? 1 : 0), dark);
            const total = this.size * this.size;
            const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
            assert(0 <= k && k <= 9);
            result += k * PENALTY_N4;
            return result;
        }

        _getAlignmentPatternPositions() {
            if (this.version === 1) return [];
            const numAlign = Math.floor(this.version / 7) + 2;
            const step = Math.floor((this.version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
            const result = [6];
            for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
            return result;
        }

        _finderPenaltyCountPatterns(runHistory) {
            const n = runHistory[1];
            assert(n <= this.size * 3);
            const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
            return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0)
                 + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
        }

        _finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
            if (currentRunColor) { this._finderPenaltyAddHistory(currentRunLength, runHistory); currentRunLength = 0; }
            currentRunLength += this.size;
            this._finderPenaltyAddHistory(currentRunLength, runHistory);
            return this._finderPenaltyCountPatterns(runHistory);
        }

        _finderPenaltyAddHistory(currentRunLength, runHistory) {
            if (runHistory[0] === 0) currentRunLength += this.size;
            runHistory.pop();
            runHistory.unshift(currentRunLength);
        }

        // ─── Static helpers ────────────────────────────────────────────

        static _getNumRawDataModules(ver) {
            if (ver < 1 || ver > 40) throw new RangeError('Version out of range');
            let result = (16 * ver + 128) * ver + 64;
            if (ver >= 2) {
                const numAlign = Math.floor(ver / 7) + 2;
                result -= (25 * numAlign - 10) * numAlign - 55;
                if (ver >= 7) result -= 36;
            }
            assert(208 <= result && result <= 29648);
            return result;
        }

        static _getNumDataCodewords(ver, ecl) {
            return Math.floor(QrCode._getNumRawDataModules(ver) / 8) -
                ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] *
                NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
        }

        static _reedSolomonComputeDivisor(degree) {
            if (degree < 1 || degree > 255) throw new RangeError('Degree out of range');
            const result = [];
            for (let i = 0; i < degree - 1; i++) result.push(0);
            result.push(1);
            let root = 1;
            for (let i = 0; i < degree; i++) {
                for (let j = 0; j < result.length; j++) {
                    result[j] = QrCode._reedSolomonMultiply(result[j], root);
                    if (j + 1 < result.length) result[j] ^= result[j + 1];
                }
                root = QrCode._reedSolomonMultiply(root, 0x02);
            }
            return result;
        }

        static _reedSolomonComputeRemainder(data, divisor) {
            const result = divisor.map(() => 0);
            for (const b of data) {
                const factor = b ^ result.shift();
                result.push(0);
                divisor.forEach((coef, i) => { result[i] ^= QrCode._reedSolomonMultiply(coef, factor); });
            }
            return result;
        }

        static _reedSolomonMultiply(x, y) {
            if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError('Byte out of range');
            let z = 0;
            for (let i = 7; i >= 0; i--) {
                z = (z << 1) ^ ((z >>> 7) * 0x11D);
                z ^= ((y >>> i) & 1) * x;
            }
            assert(z >>> 8 === 0);
            return z;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SVG Renderer
    // ═══════════════════════════════════════════════════════════════════════════

    function toSvg(text, options) {
        const opts   = Object.assign({ ecl: 'medium', border: 2, lightColor: '#ffffff', darkColor: '#000000' }, options);
        const eclMap = { low: Ecc.LOW, medium: Ecc.MEDIUM, quartile: Ecc.QUARTILE, high: Ecc.HIGH };
        const ecl    = eclMap[opts.ecl] || Ecc.MEDIUM;
        const qr     = QrCode.encodeText(text, ecl);
        const border = opts.border;
        const total  = qr.size + border * 2;

        let parts = [];
        for (let y = 0; y < qr.size; y++) {
            for (let x = 0; x < qr.size; x++) {
                if (qr.getModule(x, y))
                    parts.push(`M${x + border},${y + border}h1v1h-1z`);
            }
        }

        return [
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
            `<rect width="100%" height="100%" fill="${opts.lightColor}"/>`,
            `<path d="${parts.join('')}" fill="${opts.darkColor}"/>`,
            `</svg>`
        ].join('');
    }

    function toDataUrl(text, options) {
        const svg = toSvg(text, options);
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Public API
    // ═══════════════════════════════════════════════════════════════════════════

    if (!window.sgraphAdmin) window.sgraphAdmin = {};
    window.sgraphAdmin.qr = { toSvg, toDataUrl };

})();
