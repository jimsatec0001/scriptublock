/*******************************************************************************

    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2020-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock
*/

'use strict';

/******************************************************************************/

import Regex from '../lib/regexanalyzer/regex.js';
import * as cssTree from '../lib/csstree/css-tree.js';

/*******************************************************************************
 * 
 * The parser creates a simple unidirectional AST from a raw line of text.
 * Each node in the AST is a sequence of numbers, so as to avoid the need to
 * make frequent memory allocation to represent the AST.
 * 
 * All the AST nodes are allocated in the same integer-only array, which
 * array is reused when parsing new lines.
 * 
 * The AST can only be walked from top to bottom, then left to right.
 * 
 * Each node typically refer to a corresponding string slice in the source
 * text.
 *
 * It may happens a node requires to normalize the corresponding source slice,
 * in which case there will be a reference in the AST to a transformed source
 * string. (For example, a domain name might contain unicode characters, in
 * which case the corresponding node will contain a reference to the
 * (transformed) punycoded version of the domain name.)
 * 
 * The AST can be easily used for syntax coloring purpose, in which case it's
 * just a matter of walking through all the nodes in natural order.
 * 
 * A tree walking utility class exists for compilation and syntax coloring
 * purpose.
 * 
**/

/******************************************************************************/

let iota = 0;

iota = 0;
export const AST_TYPE_NONE                          = iota++;
export const AST_TYPE_UNKNOWN                       = iota++;
export const AST_TYPE_COMMENT                       = iota++;
export const AST_TYPE_NETWORK                       = iota++;
export const AST_TYPE_EXTENDED                      = iota++;

iota = 0;
export const AST_TYPE_NETWORK_PATTERN_ANY           = iota++;
export const AST_TYPE_NETWORK_PATTERN_HOSTNAME      = iota++;
export const AST_TYPE_NETWORK_PATTERN_PLAIN         = iota++;
export const AST_TYPE_NETWORK_PATTERN_REGEX         = iota++;
export const AST_TYPE_NETWORK_PATTERN_GENERIC       = iota++;
export const AST_TYPE_NETWORK_PATTERN_BAD           = iota++;
export const AST_TYPE_EXTENDED_COSMETIC             = iota++;
export const AST_TYPE_EXTENDED_SCRIPTLET            = iota++;
export const AST_TYPE_EXTENDED_HTML                 = iota++;
export const AST_TYPE_EXTENDED_RESPONSEHEADER       = iota++;
export const AST_TYPE_COMMENT_PREPARSER             = iota++;

iota = 0;
export const AST_FLAG_UNSUPPORTED                   = 1 << iota++;
export const AST_FLAG_IGNORE                        = 1 << iota++;
export const AST_FLAG_HAS_ERROR                     = 1 << iota++;
export const AST_FLAG_IS_EXCEPTION                  = 1 << iota++;
export const AST_FLAG_EXT_STRONG                    = 1 << iota++;
export const AST_FLAG_EXT_STYLE                     = 1 << iota++;
export const AST_FLAG_EXT_SCRIPTLET_ADG             = 1 << iota++;
export const AST_FLAG_NET_PATTERN_LEFT_HNANCHOR     = 1 << iota++;
export const AST_FLAG_NET_PATTERN_RIGHT_PATHANCHOR  = 1 << iota++;
export const AST_FLAG_NET_PATTERN_LEFT_ANCHOR       = 1 << iota++;
export const AST_FLAG_NET_PATTERN_RIGHT_ANCHOR      = 1 << iota++;
export const AST_FLAG_HAS_OPTIONS                   = 1 << iota++;

iota = 0;
export const AST_ERROR_NONE                         = 1 << iota++;
export const AST_ERROR_REGEX                        = 1 << iota++;
export const AST_ERROR_PATTERN                      = 1 << iota++;
export const AST_ERROR_DOMAIN_NAME                  = 1 << iota++;
export const AST_ERROR_OPTION_DUPLICATE             = 1 << iota++;
export const AST_ERROR_OPTION_UNKNOWN               = 1 << iota++;
export const AST_ERROR_IF_TOKEN_UNKNOWN             = 1 << iota++;

iota = 0;
const NODE_RIGHT_INDEX                              = iota++;
const NOOP_NODE_SIZE                                = iota;
const NODE_TYPE_INDEX                               = iota++;
const NODE_DOWN_INDEX                               = iota++;
const NODE_BEG_INDEX                                = iota++;
const NODE_END_INDEX                                = iota++;
const NODE_FLAGS_INDEX                              = iota++;
const NODE_TRANSFORM_INDEX                          = iota++;
const FULL_NODE_SIZE                                = iota;

iota = 0;
export const NODE_TYPE_NOOP                         = iota++;
export const NODE_TYPE_LINE_RAW                     = iota++;
export const NODE_TYPE_LINE_BODY                    = iota++;
export const NODE_TYPE_WHITESPACE                   = iota++;
export const NODE_TYPE_COMMENT                      = iota++;
export const NODE_TYPE_IGNORE                       = iota++;
export const NODE_TYPE_EXT_RAW                      = iota++;
export const NODE_TYPE_EXT_OPTIONS_ANCHOR           = iota++;
export const NODE_TYPE_EXT_OPTIONS                  = iota++;
export const NODE_TYPE_EXT_DECORATION               = iota++;
export const NODE_TYPE_EXT_PATTERN_RAW              = iota++;
export const NODE_TYPE_EXT_PATTERN_COSMETIC         = iota++;
export const NODE_TYPE_EXT_PATTERN_HTML             = iota++;
export const NODE_TYPE_EXT_PATTERN_RESPONSEHEADER   = iota++;
export const NODE_TYPE_EXT_PATTERN_SCRIPTLET        = iota++;
export const NODE_TYPE_EXT_PATTERN_SCRIPTLET_TOKEN  = iota++;
export const NODE_TYPE_EXT_PATTERN_SCRIPTLET_ARGS   = iota++;
export const NODE_TYPE_EXT_PATTERN_SCRIPTLET_ARG    = iota++;
export const NODE_TYPE_NET_RAW                      = iota++;
export const NODE_TYPE_NET_EXCEPTION                = iota++;
export const NODE_TYPE_NET_PATTERN_RAW              = iota++;
export const NODE_TYPE_NET_PATTERN                  = iota++;
export const NODE_TYPE_NET_PATTERN_PART             = iota++;
export const NODE_TYPE_NET_PATTERN_PART_SPECIAL     = iota++;
export const NODE_TYPE_NET_PATTERN_PART_UNICODE     = iota++;
export const NODE_TYPE_NET_PATTERN_LEFT_HNANCHOR    = iota++;
export const NODE_TYPE_NET_PATTERN_LEFT_ANCHOR      = iota++;
export const NODE_TYPE_NET_PATTERN_RIGHT_ANCHOR     = iota++;
export const NODE_TYPE_NET_OPTIONS_ANCHOR           = iota++;
export const NODE_TYPE_NET_OPTIONS                  = iota++;
export const NODE_TYPE_NET_OPTION_SEPARATOR         = iota++;
export const NODE_TYPE_NET_OPTION_SENTINEL          = iota++;
export const NODE_TYPE_NET_OPTION_RAW               = iota++;
export const NODE_TYPE_NET_OPTION_NAME_NOT          = iota++;
export const NODE_TYPE_NET_OPTION_NAME_UNKNOWN      = iota++;
export const NODE_TYPE_NET_OPTION_NAME_1P           = iota++;
export const NODE_TYPE_NET_OPTION_NAME_STRICT1P     = iota++;
export const NODE_TYPE_NET_OPTION_NAME_3P           = iota++;
export const NODE_TYPE_NET_OPTION_NAME_STRICT3P     = iota++;
export const NODE_TYPE_NET_OPTION_NAME_ALL          = iota++;
export const NODE_TYPE_NET_OPTION_NAME_BADFILTER    = iota++;
export const NODE_TYPE_NET_OPTION_NAME_CNAME        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_CSP          = iota++;
export const NODE_TYPE_NET_OPTION_NAME_CSS          = iota++;
export const NODE_TYPE_NET_OPTION_NAME_DENYALLOW    = iota++;
export const NODE_TYPE_NET_OPTION_NAME_DOC          = iota++;
export const NODE_TYPE_NET_OPTION_NAME_EHIDE        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_EMPTY        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_FONT         = iota++;
export const NODE_TYPE_NET_OPTION_NAME_FRAME        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_FROM         = iota++;
export const NODE_TYPE_NET_OPTION_NAME_GENERICBLOCK = iota++;
export const NODE_TYPE_NET_OPTION_NAME_GHIDE        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_HEADER       = iota++;
export const NODE_TYPE_NET_OPTION_NAME_IMAGE        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_IMPORTANT    = iota++;
export const NODE_TYPE_NET_OPTION_NAME_INLINEFONT   = iota++;
export const NODE_TYPE_NET_OPTION_NAME_INLINESCRIPT = iota++;
export const NODE_TYPE_NET_OPTION_NAME_MATCHCASE    = iota++;
export const NODE_TYPE_NET_OPTION_NAME_MEDIA        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_METHOD       = iota++;
export const NODE_TYPE_NET_OPTION_NAME_MP4          = iota++;
export const NODE_TYPE_NET_OPTION_NAME_NOOP         = iota++;
export const NODE_TYPE_NET_OPTION_NAME_OBJECT       = iota++;
export const NODE_TYPE_NET_OPTION_NAME_OTHER        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_PERMISSIONS  = iota++;
export const NODE_TYPE_NET_OPTION_NAME_PING         = iota++;
export const NODE_TYPE_NET_OPTION_NAME_POPUNDER     = iota++;
export const NODE_TYPE_NET_OPTION_NAME_POPUP        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_REDIRECT     = iota++;
export const NODE_TYPE_NET_OPTION_NAME_REDIRECTRULE = iota++;
export const NODE_TYPE_NET_OPTION_NAME_REMOVEPARAM  = iota++;
export const NODE_TYPE_NET_OPTION_NAME_SCRIPT       = iota++;
export const NODE_TYPE_NET_OPTION_NAME_SHIDE        = iota++;
export const NODE_TYPE_NET_OPTION_NAME_TO           = iota++;
export const NODE_TYPE_NET_OPTION_NAME_XHR          = iota++;
export const NODE_TYPE_NET_OPTION_NAME_WEBRTC       = iota++;
export const NODE_TYPE_NET_OPTION_NAME_WEBSOCKET    = iota++;
export const NODE_TYPE_NET_OPTION_ASSIGN            = iota++;
export const NODE_TYPE_NET_OPTION_VALUE             = iota++;
export const NODE_TYPE_OPTION_VALUE_DOMAIN_LIST     = iota++;
export const NODE_TYPE_OPTION_VALUE_DOMAIN_RAW      = iota++;
export const NODE_TYPE_OPTION_VALUE_NOT             = iota++;
export const NODE_TYPE_OPTION_VALUE_DOMAIN          = iota++;
export const NODE_TYPE_OPTION_VALUE_SEPARATOR       = iota++;
export const NODE_TYPE_PREPARSE_DIRECTIVE           = iota++;
export const NODE_TYPE_PREPARSE_DIRECTIVE_VALUE     = iota++;
export const NODE_TYPE_PREPARSE_DIRECTIVE_IF        = iota++;
export const NODE_TYPE_PREPARSE_DIRECTIVE_IF_VALUE  = iota++;
export const NODE_TYPE_COMMENT_URL                  = iota++;
export const NODE_TYPE_COUNT                        = iota;

iota = 0;
export const NODE_FLAG_IGNORE                       = 1 << iota++;
export const NODE_FLAG_ERROR                        = 1 << iota++;
export const NODE_FLAG_IS_NEGATED                   = 1 << iota++;
export const NODE_FLAG_OPTION_HAS_VALUE             = 1 << iota++;
export const NODE_FLAG_PATTERN_UNTOKENIZABLE        = 1 << iota++;

export const nodeTypeFromOptionName = new Map([
    [ '', NODE_TYPE_NET_OPTION_NAME_UNKNOWN ],
    [ '1p', NODE_TYPE_NET_OPTION_NAME_1P ],
    /* synonym */ [ 'first-party', NODE_TYPE_NET_OPTION_NAME_1P ],
    [ 'strict1p', NODE_TYPE_NET_OPTION_NAME_STRICT1P ],
    [ '3p', NODE_TYPE_NET_OPTION_NAME_3P ],
    /* synonym */ [ 'third-party', NODE_TYPE_NET_OPTION_NAME_3P ],
    [ 'strict3p', NODE_TYPE_NET_OPTION_NAME_STRICT3P ],
    [ 'all', NODE_TYPE_NET_OPTION_NAME_ALL ],
    [ 'badfilter', NODE_TYPE_NET_OPTION_NAME_BADFILTER ],
    [ 'cname', NODE_TYPE_NET_OPTION_NAME_CNAME ],
    [ 'csp', NODE_TYPE_NET_OPTION_NAME_CSP ],
    [ 'css', NODE_TYPE_NET_OPTION_NAME_CSS ],
    /* synonym */ [ 'stylesheet', NODE_TYPE_NET_OPTION_NAME_CSS ],
    [ 'denyallow', NODE_TYPE_NET_OPTION_NAME_DENYALLOW ],
    [ 'doc', NODE_TYPE_NET_OPTION_NAME_DOC ],
    /* synonym */ [ 'document', NODE_TYPE_NET_OPTION_NAME_DOC ],
    [ 'ehide', NODE_TYPE_NET_OPTION_NAME_EHIDE ],
    /* synonym */ [ 'elemhide', NODE_TYPE_NET_OPTION_NAME_EHIDE ],
    [ 'empty', NODE_TYPE_NET_OPTION_NAME_EMPTY ],
    [ 'font', NODE_TYPE_NET_OPTION_NAME_FONT ],
    [ 'frame', NODE_TYPE_NET_OPTION_NAME_FRAME ],
    /* synonym */ [ 'subdocument', NODE_TYPE_NET_OPTION_NAME_FRAME ],
    [ 'from', NODE_TYPE_NET_OPTION_NAME_FROM ],
    /* synonym */ [ 'domain', NODE_TYPE_NET_OPTION_NAME_FROM ],
    [ 'genericblock', NODE_TYPE_NET_OPTION_NAME_GENERICBLOCK ],
    [ 'ghide', NODE_TYPE_NET_OPTION_NAME_GHIDE ],
    /* synonym */ [ 'generichide', NODE_TYPE_NET_OPTION_NAME_GHIDE ],
    [ 'header', NODE_TYPE_NET_OPTION_NAME_HEADER ],
    [ 'image', NODE_TYPE_NET_OPTION_NAME_IMAGE ],
    [ 'important', NODE_TYPE_NET_OPTION_NAME_IMPORTANT ],
    [ 'inline-font', NODE_TYPE_NET_OPTION_NAME_INLINEFONT ],
    [ 'inline-script', NODE_TYPE_NET_OPTION_NAME_INLINESCRIPT ],
    [ 'match-case', NODE_TYPE_NET_OPTION_NAME_MATCHCASE ],
    [ 'media', NODE_TYPE_NET_OPTION_NAME_MEDIA ],
    [ 'method', NODE_TYPE_NET_OPTION_NAME_METHOD ],
    [ 'mp4', NODE_TYPE_NET_OPTION_NAME_MP4 ],
    [ '_', NODE_TYPE_NET_OPTION_NAME_NOOP ],
    [ 'object', NODE_TYPE_NET_OPTION_NAME_OBJECT ],
    /* synonym */ [ 'object-subrequest', NODE_TYPE_NET_OPTION_NAME_OBJECT ],
    [ 'other', NODE_TYPE_NET_OPTION_NAME_OTHER ],
    [ 'permissions', NODE_TYPE_NET_OPTION_NAME_PERMISSIONS ],
    [ 'ping', NODE_TYPE_NET_OPTION_NAME_PING ],
    /* synonym */ [ 'beacon', NODE_TYPE_NET_OPTION_NAME_PING ],
    [ 'popunder', NODE_TYPE_NET_OPTION_NAME_POPUNDER ],
    [ 'popup', NODE_TYPE_NET_OPTION_NAME_POPUP ],
    [ 'redirect', NODE_TYPE_NET_OPTION_NAME_REDIRECT ],
    /* synonym */ [ 'rewrite', NODE_TYPE_NET_OPTION_NAME_REDIRECT ],
    [ 'redirect-rule', NODE_TYPE_NET_OPTION_NAME_REDIRECTRULE ],
    [ 'removeparam', NODE_TYPE_NET_OPTION_NAME_REMOVEPARAM ],
    /* synonym */ [ 'queryprune', NODE_TYPE_NET_OPTION_NAME_REMOVEPARAM ],
    [ 'script', NODE_TYPE_NET_OPTION_NAME_SCRIPT ],
    [ 'shide', NODE_TYPE_NET_OPTION_NAME_SHIDE ],
    /* synonym */ [ 'specifichide', NODE_TYPE_NET_OPTION_NAME_SHIDE ],
    [ 'to', NODE_TYPE_NET_OPTION_NAME_TO ],
    [ 'xhr', NODE_TYPE_NET_OPTION_NAME_XHR ],
    /* synonym */ [ 'xmlhttprequest', NODE_TYPE_NET_OPTION_NAME_XHR ],
    [ 'webrtc', NODE_TYPE_NET_OPTION_NAME_WEBRTC ],
    [ 'websocket', NODE_TYPE_NET_OPTION_NAME_WEBSOCKET ],
]);

export const nodeNameFromNodeType = new Map([
    [ NODE_TYPE_NOOP, 'noop' ],
    [ NODE_TYPE_LINE_RAW, 'lineRaw' ],
    [ NODE_TYPE_LINE_BODY, 'lineBody' ],
    [ NODE_TYPE_WHITESPACE, 'whitespace' ],
    [ NODE_TYPE_COMMENT, 'comment' ],
    [ NODE_TYPE_IGNORE, 'ignore' ],
    [ NODE_TYPE_EXT_RAW, 'extRaw' ],
    [ NODE_TYPE_EXT_OPTIONS_ANCHOR, 'extOptionsAnchor' ],
    [ NODE_TYPE_EXT_OPTIONS, 'extOptions' ],
    [ NODE_TYPE_EXT_DECORATION, 'extDecoration' ],
    [ NODE_TYPE_EXT_PATTERN_RAW, 'extPatternRaw' ],
    [ NODE_TYPE_EXT_PATTERN_COSMETIC, 'extPatternCosmetic' ],
    [ NODE_TYPE_EXT_PATTERN_HTML, 'extPatternHtml' ],
    [ NODE_TYPE_EXT_PATTERN_RESPONSEHEADER, 'extPatternResponseheader' ],
    [ NODE_TYPE_EXT_PATTERN_SCRIPTLET, 'extPatternScriptlet' ],
    [ NODE_TYPE_EXT_PATTERN_SCRIPTLET_TOKEN, 'extPatternScriptletToken' ],
    [ NODE_TYPE_EXT_PATTERN_SCRIPTLET_ARGS, 'extPatternScriptletArgs' ],
    [ NODE_TYPE_EXT_PATTERN_SCRIPTLET_ARG, 'extPatternScriptletArg' ],
    [ NODE_TYPE_NET_RAW, 'netRaw' ],
    [ NODE_TYPE_NET_EXCEPTION, 'netException' ],
    [ NODE_TYPE_NET_PATTERN_RAW, 'netPatternRaw' ],
    [ NODE_TYPE_NET_PATTERN, 'netPattern' ],
    [ NODE_TYPE_NET_PATTERN_PART, 'netPatternPart' ],
    [ NODE_TYPE_NET_PATTERN_PART_SPECIAL, 'netPatternPartSpecial' ],
    [ NODE_TYPE_NET_PATTERN_PART_UNICODE, 'netPatternPartUnicode' ],
    [ NODE_TYPE_NET_PATTERN_LEFT_HNANCHOR, 'netPatternLeftHnanchor' ],
    [ NODE_TYPE_NET_PATTERN_LEFT_ANCHOR, 'netPatternLeftAnchor' ],
    [ NODE_TYPE_NET_PATTERN_RIGHT_ANCHOR, 'netPatternRightAnchor' ],
    [ NODE_TYPE_NET_OPTIONS_ANCHOR, 'netOptionsAnchor' ],
    [ NODE_TYPE_NET_OPTIONS, 'netOptions' ],
    [ NODE_TYPE_NET_OPTION_RAW, 'netOptionRaw' ],
    [ NODE_TYPE_NET_OPTION_SEPARATOR, 'netOptionSeparator'],
    [ NODE_TYPE_NET_OPTION_SENTINEL, 'netOptionSentinel' ],
    [ NODE_TYPE_NET_OPTION_NAME_NOT, 'netOptionNameNot'],
    [ NODE_TYPE_NET_OPTION_ASSIGN, 'netOptionAssign' ],
    [ NODE_TYPE_NET_OPTION_VALUE, 'netOptionValue' ],
    [ NODE_TYPE_OPTION_VALUE_DOMAIN_LIST, 'netOptionValueDomainList' ],
    [ NODE_TYPE_OPTION_VALUE_DOMAIN_RAW, 'netOptionValueDomainRaw' ],
    [ NODE_TYPE_OPTION_VALUE_NOT, 'netOptionValueNot' ],
    [ NODE_TYPE_OPTION_VALUE_DOMAIN, 'netOptionValueDomain' ],
    [ NODE_TYPE_OPTION_VALUE_SEPARATOR, 'netOptionsValueSeparator' ],
]);
{
    for ( const [ name, type ] of nodeTypeFromOptionName ) {
        nodeNameFromNodeType.set(type, name);
    }
}

/******************************************************************************/

// Precomputed AST layouts for most common filters.

const astTemplates = {
    // ||example.com^
    netHnAnchoredHostnameAscii: {
        flags: AST_FLAG_NET_PATTERN_LEFT_HNANCHOR |
            AST_FLAG_NET_PATTERN_RIGHT_PATHANCHOR,
        type: NODE_TYPE_LINE_BODY,
        beg: 0,
        end: 0,
        children: [{
            type: NODE_TYPE_NET_RAW,
            beg: 0,
            end: 0,
            children: [{
                type: NODE_TYPE_NET_PATTERN_RAW,
                beg: 0,
                end: 0,
                register: true,
                children: [{
                    type: NODE_TYPE_NET_PATTERN_LEFT_HNANCHOR,
                    beg: 0,
                    end: 2,
                }, {
                    type: NODE_TYPE_NET_PATTERN,
                    beg: 2,
                    end: -1,
                    register: true,
                }, {
                    type: NODE_TYPE_NET_PATTERN_PART_SPECIAL,
                    beg: -1,
                    end: 0,
                }],
            }],
        }],
    },
    // ||example.com^$third-party
    net3pHnAnchoredHostnameAscii: {
        flags: AST_FLAG_NET_PATTERN_LEFT_HNANCHOR |
            AST_FLAG_NET_PATTERN_RIGHT_PATHANCHOR |
            AST_FLAG_HAS_OPTIONS,
        type: NODE_TYPE_LINE_BODY,
        beg: 0,
        end: 0,
        children: [{
            type: NODE_TYPE_NET_RAW,
            beg: 0,
            end: 0,
            children: [{
                type: NODE_TYPE_NET_PATTERN_RAW,
                beg: 0,
                end: 0,
                register: true,
                children: [{
                    type: NODE_TYPE_NET_PATTERN_LEFT_HNANCHOR,
                    beg: 0,
                    end: 2,
                }, {
                    type: NODE_TYPE_NET_PATTERN,
                    beg: 2,
                    end: -13,
                    register: true,
                }, {
                    type: NODE_TYPE_NET_PATTERN_PART_SPECIAL,
                    beg: -13,
                    end: -12,
                }],
            }, {
                type: NODE_TYPE_NET_OPTIONS_ANCHOR,
                beg: -12,
                end: -11,
            }, {
                type: NODE_TYPE_NET_OPTIONS,
                beg: -11,
                end: 0,
                register: true,
                children: [{
                    type: NODE_TYPE_NET_OPTION_RAW,
                    beg: 0,
                    end: 0,
                    children: [{
                        type: NODE_TYPE_NET_OPTION_NAME_3P,
                        beg: 0,
                        end: 0,
                        register: true,
                    }],
                }],
            }],
        }],
    },
    // ||example.com/path/to/resource
    netHnAnchoredPlainAscii: {
        flags: AST_FLAG_NET_PATTERN_LEFT_HNANCHOR,
        type: NODE_TYPE_LINE_BODY,
        beg: 0,
        end: 0,
        children: [{
            type: NODE_TYPE_NET_RAW,
            beg: 0,
            end: 0,
            children: [{
                type: NODE_TYPE_NET_PATTERN_RAW,
                beg: 0,
                end: 0,
                register: true,
                children: [{
                    type: NODE_TYPE_NET_PATTERN_LEFT_HNANCHOR,
                    beg: 0,
                    end: 2,
                }, {
                    type: NODE_TYPE_NET_PATTERN,
                    beg: 2,
                    end: 0,
                    register: true,
                }],
            }],
        }],
    },
    // example.com
    // -resource.
    netPlainAscii: {
        type: NODE_TYPE_LINE_BODY,
        beg: 0,
        end: 0,
        children: [{
            type: NODE_TYPE_NET_RAW,
            beg: 0,
            end: 0,
            children: [{
                type: NODE_TYPE_NET_PATTERN_RAW,
                beg: 0,
                end: 0,
                register: true,
                children: [{
                    type: NODE_TYPE_NET_PATTERN,
                    beg: 0,
                    end: 0,
                    register: true,
                }],
            }],
        }],
    },
    // 127.0.0.1 example.com
    netHosts1: {
        type: NODE_TYPE_LINE_BODY,
        beg: 0,
        end: 0,
        children: [{
            type: NODE_TYPE_NET_RAW,
            beg: 0,
            end: 0,
            children: [{
                type: NODE_TYPE_NET_PATTERN_RAW,
                beg: 0,
                end: 0,
                register: true,
                children: [{
                    type: NODE_TYPE_IGNORE,
                    beg: 0,
                    end: 10,
                }, {
                    type: NODE_TYPE_NET_PATTERN,
                    beg: 10,
                    end: 0,
                    register: true,
                }],
            }],
        }],
    },
    // 0.0.0.0 example.com
    netHosts2: {
        type: NODE_TYPE_LINE_BODY,
        beg: 0,
        end: 0,
        children: [{
            type: NODE_TYPE_NET_RAW,
            beg: 0,
            end: 0,
            children: [{
                type: NODE_TYPE_NET_PATTERN_RAW,
                beg: 0,
                end: 0,
                register: true,
                children: [{
                    type: NODE_TYPE_IGNORE,
                    beg: 0,
                    end: 8,
                }, {
                    type: NODE_TYPE_NET_PATTERN,
                    beg: 8,
                    end: 0,
                    register: true,
                }],
            }],
        }],
    },
    // ##.ads-container
    extPlainGenericSelector: {
        type: NODE_TYPE_LINE_BODY,
        beg: 0,
        end: 0,
        children: [{
            type: NODE_TYPE_EXT_RAW,
            beg: 0,
            end: 0,
            children: [{
                type: NODE_TYPE_EXT_OPTIONS_ANCHOR,
                beg: 0,
                end: 2,
                register: true,
            }, {
                type: NODE_TYPE_EXT_PATTERN_RAW,
                beg: 2,
                end: 0,
                register: true,
                children: [{
                    type: NODE_TYPE_EXT_PATTERN_COSMETIC,
                    beg: 0,
                    end: 0,
                }],
            }],
        }],
    },
};

/******************************************************************************/

export const removableHTTPHeaders = new Set([
    'location',
    'refresh',
    'report-to',
    'set-cookie',
]);

export const preparserIfTokens = new Set([
    'ext_ublock',
    'ext_ubol',
    'ext_devbuild',
    'env_chromium',
    'env_edge',
    'env_firefox',
    'env_legacy',
    'env_mobile',
    'env_mv3',
    'env_safari',
    'cap_html_filtering',
    'cap_user_stylesheet',
    'false',
    'ext_abp',
    'adguard',
    'adguard_app_android',
    'adguard_app_ios',
    'adguard_app_mac',
    'adguard_app_windows',
    'adguard_ext_android_cb',
    'adguard_ext_chromium',
    'adguard_ext_edge',
    'adguard_ext_firefox',
    'adguard_ext_opera',
    'adguard_ext_safari',
]);

/******************************************************************************/

const exCharCodeAt = (s, i) => {
    const pos = i >= 0 ? i : s.length + i;
    return pos >= 0 ? s.charCodeAt(pos) : -1;
};

/******************************************************************************/

class AstWalker {
    constructor(parser, from = 0) {
        this.parser = parser;
        this.stack = [];
        this.reset(from);
    }
    get depth() {
        return this.stackPtr;
    }
    reset(from = 0) {
        this.nodes = this.parser.nodes;
        this.stackPtr = 0;
        return (this.current = from || this.parser.rootNode);
    }
    next() {
        const current = this.current;
        if ( current === 0 ) { return 0; }
        const down = this.nodes[current+NODE_DOWN_INDEX];
        if ( down !== 0 ) {
            this.stack[this.stackPtr++] = this.current;
            return (this.current = down);
        }
        const right = this.nodes[current+NODE_RIGHT_INDEX];
        if ( right !== 0 && this.stackPtr !== 0 ) {
            return (this.current = right);
        }
        while ( this.stackPtr !== 0 ) {
            const parent = this.stack[--this.stackPtr];
            const right = this.nodes[parent+NODE_RIGHT_INDEX];
            if ( right !== 0 ) {
                return (this.current = right);
            }
        }
        return (this.current = 0);
    }
    right() {
        const current = this.current;
        if ( current === 0 ) { return 0; }
        const right = this.nodes[current+NODE_RIGHT_INDEX];
        if ( right !== 0 && this.stackPtr !== 0 ) {
            return (this.current = right);
        }
        while ( this.stackPtr !== 0 ) {
            const parent = this.stack[--this.stackPtr];
            const right = this.nodes[parent+NODE_RIGHT_INDEX];
            if ( right !== 0 ) {
                return (this.current = right);
            }
        }
        return (this.current = 0);
    }
    until(which) {
        let node = this.next();
        while ( node !== 0 ) {
            if ( this.nodes[node+NODE_TYPE_INDEX] === which ) { return node; }
            node = this.next();
        }
        return 0;
    }
    canGoDown() {
        return this.nodes[this.current+NODE_DOWN_INDEX] !== 0;
    }
    dispose() {
        this.parser.walkerJunkyard.push(this);
    }
}

/******************************************************************************/

class DomainListIterator {
    constructor(parser, root) {
        this.parser = parser;
        this.walker = parser.getWalker();
        this.value = undefined;
        this.item = { hn: '', not: false, bad: false };
        this.reuse(root);
    }
    next() {
        if ( this.done ) { return this.value; }
        let node = this.walker.current;
        let ready = false;
        while ( node !== 0 ) {
            switch ( this.parser.getNodeType(node) ) {
                case NODE_TYPE_OPTION_VALUE_DOMAIN_RAW:
                    this.item.hn = '';
                    this.item.not = false;
                    this.item.bad = this.parser.getNodeFlags(node, NODE_FLAG_ERROR) !== 0;
                    break;
                case NODE_TYPE_OPTION_VALUE_NOT:
                    this.item.not = true;
                    break;
                case NODE_TYPE_OPTION_VALUE_DOMAIN:
                    this.item.hn = this.parser.getNodeTransform(node);
                    this.value = this.item;
                    ready = true;
                    break;
                default:
                    break;
            }
            node = this.walker.next();
            if ( ready ) { return this; }
        }
        return this.stop();
    }
    reuse(root) {
        this.walker.reset(root);
        this.done = false;
        return this;
    }
    stop() {
        this.done = true;
        this.value = undefined;
        this.parser.domainListIteratorJunkyard.push(this);
        return this;
    }
    [Symbol.iterator]() {
        return this;
    }
}

/******************************************************************************/

export class AstFilterParser {
    constructor(options = {}) {
        this.raw = '';
        this.rawEnd = 0;
        this.nodes = new Uint32Array(16384);
        this.nodePoolPtr = FULL_NODE_SIZE;
        this.nodePoolEnd = this.nodes.length;
        this.astTransforms = [ null ];
        this.astTransformPtr = 1;
        this.rootNode = 0;
        this.astType = AST_TYPE_NONE;
        this.astTypeFlavor = AST_TYPE_NONE;
        this.astFlags = 0;
        this.astError = 0;
        this.nodeTypeRegister = [];
        this.nodeTypeRegisterPtr = 0;
        this.nodeTypeLookupTable = new Uint32Array(NODE_TYPE_COUNT);
        this.punycoder = new URL('https://ublock0.invalid/');
        this.domainListIteratorJunkyard = [];
        this.walkerJunkyard = [];
        this.hasWhitespace = false;
        this.hasUnicode = false;
        this.hasUppercase = false;
        // Options
        this.options = options;
        this.interactive = options.interactive || false;
        this.expertMode = options.expertMode || false;
        this.badTypes = new Set(options.badTypes || []);
        this.maxTokenLength = options.maxTokenLength || 7;
        // TODO: rethink this
        this.result = { exception: false, raw: '', compiled: '', error: undefined };
        this.selectorCompiler = new ExtSelectorCompiler(options);
        // Regexes
        this.reWhitespaceStart = /^\s+/;
        this.reWhitespaceEnd = /\s+$/;
        this.reCommentLine = /^(?:!|#\s|####|\[adblock)/i;
        this.reExtAnchor = /(#@?(?:\$\?|\$|%|\?)?#).{1,2}/;
        this.reInlineComment = /(?:\s+#).*?$/;
        this.reNetException = /^@@/;
        this.reNetAnchor = /(?:)\$[^,\w~]/;
        this.reHnAnchoredPlainAscii = /^\|\|[0-9a-z%&,\-.\/:;=?_]+$/;
        this.reHnAnchoredHostnameAscii = /^\|\|(?:[\da-z][\da-z_-]*\.)*[\da-z_-]*[\da-z]\^$/;
        this.reHnAnchoredHostnameUnicode = /^\|\|(?:[\p{L}\p{N}][\p{L}\p{N}\u{2d}]*\.)*[\p{L}\p{N}\u{2d}]*[\p{L}\p{N}]\^$/u;
        this.reHn3pAnchoredHostnameAscii = /^\|\|(?:[\da-z][\da-z_-]*\.)*[\da-z_-]*[\da-z]\^\$third-party$/;
        this.rePlainAscii = /^[0-9a-z%&\-.\/:;=?_]{2,}$/;
        this.reNetHosts1 = /^127\.0\.0\.1 (?:[\da-z][\da-z_-]*\.)+[\da-z-]*[a-z]$/;
        this.reNetHosts2 = /^0\.0\.0\.0 (?:[\da-z][\da-z_-]*\.)+[\da-z-]*[a-z]$/;
        this.rePlainGenericCosmetic = /^##[.#][A-Za-z_][\w-]*$/;
        this.reHostnameAscii = /^(?:[\da-z][\da-z_-]*\.)*[\da-z][\da-z-]*[\da-z]$/;
        this.rePlainEntity = /^(?:[\da-z][\da-z_-]*\.)+\*$/;
        this.reHostsSink = /^[\w%.:\[\]-]+\s+/;
        this.reHostsRedirect = /(?:0\.0\.0\.0|broadcasthost|local|localhost(?:\.localdomain)?|ip6-\w+)(?:[^\w.-]|$)/;
        this.reNetOptionComma = /,(?!\d*\})/g;
        this.rePointlessLeftAnchor = /^\|\|?\*+/;
        this.reIsTokenChar = /^[%0-9A-Za-z]/;
        this.rePointlessLeadingWildcards = /^(\*+)[^%0-9A-Za-z\u{a0}-\u{10FFFF}]/u;
        this.rePointlessTrailingSeparator = /\*(\^\**)$/;
        this.rePointlessTrailingWildcards = /(?:[^%0-9A-Za-z]|[%0-9A-Za-z]{7,})(\*+)$/;
        this.reHasWhitespaceChar = /\s/;
        this.reHasUppercaseChar = /[A-Z]/;
        this.reHasUnicodeChar = /[^\x00-\x7F]/;
        this.reUnicodeChars = /\P{ASCII}/gu;
        this.reBadHostnameChars = /[\x00-\x24\x26-\x29\x2b\x2c\x2f\x3b-\x40\x5c\x5e\x60\x7b-\x7f]/;
        this.reIsEntity = /^[^*]+\.\*$/;
        this.rePreparseDirectiveIf = /^!#if /;
        this.rePreparseDirectiveAny = /^!#(?:else|endif|if |include )/;
        this.reURL = /\bhttps?:\/\/\S+/;
        this.reHasPatternSpecialChars = /[\*\^]/;
        this.rePatternAllSpecialChars = /[\*\^]+|[^\x00-\x7f]+/g;
        // https://github.com/uBlockOrigin/uBlock-issues/issues/1146
        //   From https://codemirror.net/doc/manual.html#option_specialChars
        this.reHasInvalidChar = /[\x00-\x1F\x7F-\x9F\xAD\u061C\u200B-\u200F\u2028\u2029\uFEFF\uFFF9-\uFFFC]/;
        this.reHostnamePatternPart = /^[^\x00-\x24\x26-\x29\x2B\x2C\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7F]+/;
        this.reHostnameLabel = /[^.]+/g;
        this.reResponseheaderPattern = /^\^responseheader\(.*\)$/;
        this.rePatternScriptletJsonArgs = /^\{.*\}$/;
        this.reGoodRegexToken = /[^\x01%0-9A-Za-z][%0-9A-Za-z]{7,}|[^\x01%0-9A-Za-z][%0-9A-Za-z]{1,6}[^\x01%0-9A-Za-z]/;
        this.reBadCSP = /(?:=|;)\s*report-(?:to|uri)\b/;
        this.reOddTrailingEscape = /(?:^|[^\\])(?:\\\\)*\\$/;
        this.reUnescapeCommas = /((?:^|[^\\])(?:\\\\)*)\\,/g;
        this.reUnescapeSingleQuotes = /((?:^|[^\\])(?:\\\\)*)\\'/g;
        this.reUnescapeDoubleQuotes = /((?:^|[^\\])(?:\\\\)*)\\"/g;
        this.reNoopOption = /^_+$/;
    }

    parse(raw) {
        this.raw = raw;
        this.rawEnd = raw.length;
        this.nodePoolPtr = FULL_NODE_SIZE;
        this.nodeTypeRegisterPtr = 0;
        this.astTransformPtr = 1;
        this.astType = AST_TYPE_NONE;
        this.astTypeFlavor = AST_TYPE_NONE;
        this.astFlags = 0;
        this.astError = 0;
        this.rootNode = this.allocTypedNode(NODE_TYPE_LINE_RAW, 0, this.rawEnd);
        if ( this.rawEnd === 0 ) { return; }

        // Fast-track very common simple filters using pre-computed AST layouts
        // to skip parsing and validation.
        const c1st = this.raw.charCodeAt(0);
        const clast = exCharCodeAt(this.raw, -1);
        if ( c1st === 0x7C /* | */ ) {
            if (
                clast === 0x5E /* ^ */ &&
                this.reHnAnchoredHostnameAscii.test(this.raw)
            ) {
                // ||example.com^
                this.astType = AST_TYPE_NETWORK;
                this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_HOSTNAME;
                const node = this.astFromTemplate(this.rootNode,
                    astTemplates.netHnAnchoredHostnameAscii
                );
                this.linkDown(this.rootNode, node);
                return;
            }
            if (
                this.raw.endsWith('$third-party') &&
                this.reHn3pAnchoredHostnameAscii.test(this.raw)
            ) {
                // ||example.com^$third-party
                this.astType = AST_TYPE_NETWORK;
                this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_HOSTNAME;
                const node = this.astFromTemplate(this.rootNode,
                    astTemplates.net3pHnAnchoredHostnameAscii
                );
                this.linkDown(this.rootNode, node);
                return;
            }
            if ( this.reHnAnchoredPlainAscii.test(this.raw) ) {
                // ||example.com/path/to/resource
                this.astType = AST_TYPE_NETWORK;
                this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_PLAIN;
                const node = this.astFromTemplate(this.rootNode,
                    astTemplates.netHnAnchoredPlainAscii
                );
                this.linkDown(this.rootNode, node);
                return;
            }
        } else if ( c1st === 0x23 /* # */ ) {
            if ( this.rePlainGenericCosmetic.test(this.raw) ) {
                // ##.ads-container
                this.astType = AST_TYPE_EXTENDED;
                this.astTypeFlavor = AST_TYPE_EXTENDED_COSMETIC;
                const node = this.astFromTemplate(this.rootNode,
                    astTemplates.extPlainGenericSelector
                );
                this.linkDown(this.rootNode, node);
                this.result.exception = false;
                this.result.raw = this.raw.slice(2);
                this.result.compiled = this.raw.slice(2);
                return;
            }
        } else if ( c1st === 0x31 /* 1 */ ) {
            if ( this.reNetHosts1.test(this.raw) ) {
                // 127.0.0.1 example.com
                this.astType = AST_TYPE_NETWORK;
                this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_HOSTNAME;
                const node = this.astFromTemplate(this.rootNode,
                    astTemplates.netHosts1
                );
                this.linkDown(this.rootNode, node);
                return;
            }
        } else if ( c1st === 0x30 /* 0 */ ) {
            if ( this.reNetHosts2.test(this.raw) ) {
                // 0.0.0.0 example.com
                this.astType = AST_TYPE_NETWORK;
                this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_HOSTNAME;
                const node = this.astFromTemplate(this.rootNode,
                    astTemplates.netHosts2
                );
                this.linkDown(this.rootNode, node);
                return;
            }
        } else if (
            (c1st !== 0x2F /* / */ || clast !== 0x2F /* / */) &&
            (this.rePlainAscii.test(this.raw))
        ) {
            // example.com
            // -resource.
            this.astType = AST_TYPE_NETWORK;
            this.astTypeFlavor = this.reHostnameAscii.test(this.raw)
                ? AST_TYPE_NETWORK_PATTERN_HOSTNAME
                : AST_TYPE_NETWORK_PATTERN_PLAIN;
            const node = this.astFromTemplate(this.rootNode,
                astTemplates.netPlainAscii
            );
            this.linkDown(this.rootNode, node);
            return;
        }

        // All else: full parsing and validation.
        this.hasWhitespace = this.reHasWhitespaceChar.test(raw);
        this.linkDown(this.rootNode, this.parseRaw(this.rootNode));
    }

    astFromTemplate(parent, template) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        const beg = template.beg + (template.beg >= 0 ? parentBeg : parentEnd);
        const end = template.end + (template.end <= 0 ? parentEnd : parentBeg);
        const node = this.allocTypedNode(template.type, beg, end);
        if ( template.register ) {
            this.addNodeToRegister(template.type, node);
        }
        if ( template.flags ) {
            this.addFlags(template.flags);
        }
        if ( template.nodeFlags ) {
            this.addNodeFlags(node, template.nodeFlags);
        }
        const children = template.children;
        if ( children === undefined ) { return node; }
        const head = this.astFromTemplate(node, children[0]);
        this.linkDown(node, head);
        const n = children.length;
        if ( n === 1 ) { return node; }
        let prev = head;
        for ( let i = 1; i < n; i++ ) {
            prev = this.linkRight(prev, this.astFromTemplate(node, children[i]));
        }
        return node;
    }

    getType() {
        return this.astType;
    }

    isComment() {
        return this.astType === AST_TYPE_COMMENT;
    }

    isFilter() {
        return this.isNetworkFilter() || this.isExtendedFilter();
    }

    isNetworkFilter() {
        return this.astType === AST_TYPE_NETWORK;
    }

    isExtendedFilter() {
        return this.astType === AST_TYPE_EXTENDED;
    }

    isCosmeticFilter() {
        return this.astType === AST_TYPE_EXTENDED &&
            this.astTypeFlavor === AST_TYPE_EXTENDED_COSMETIC;
    }

    isScriptletFilter() {
        return this.astType === AST_TYPE_EXTENDED &&
            this.astTypeFlavor === AST_TYPE_EXTENDED_SCRIPTLET;
    }

    isHtmlFilter() {
        return this.astType === AST_TYPE_EXTENDED &&
            this.astTypeFlavor === AST_TYPE_EXTENDED_HTML;
    }

    isResponseheaderFilter() {
        return this.astType === AST_TYPE_EXTENDED &&
            this.astTypeFlavor === AST_TYPE_EXTENDED_RESPONSEHEADER;
    }

    getFlags(flags = 0xFFFFFFFF) {
        return this.astFlags & flags;
    }

    addFlags(flags) {
        this.astFlags |= flags;
    }

    parseRaw(parent) {
        const head = this.allocHeadNode();
        let prev = head, next = 0;
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        const l1 = this.hasWhitespace
            ? this.leftWhitespaceCount(this.getNodeString(parent))
            : 0;
        if ( l1 !== 0 ) {
            next = this.allocTypedNode(
                NODE_TYPE_WHITESPACE,
                parentBeg,
                parentBeg + l1
            );
            prev = this.linkRight(prev, next);
            if ( l1 === parentEnd ) { return this.throwHeadNode(head); }
        }
        const r0 = this.hasWhitespace
            ? parentEnd - this.rightWhitespaceCount(this.getNodeString(parent))
            : parentEnd;
        if ( r0 !== l1 ) {
            next = this.allocTypedNode(
                NODE_TYPE_LINE_BODY,
                parentBeg + l1,
                parentBeg + r0
            );
            this.linkDown(next, this.parseFilter(next));
            prev = this.linkRight(prev, next);
        }
        if ( r0 !== parentEnd ) {
            next = this.allocTypedNode(
                NODE_TYPE_WHITESPACE,
                parentBeg + r0,
                parentEnd
            );
            this.linkRight(prev, next);
        }
        return this.throwHeadNode(head);
    }

    parseFilter(parent) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        const parentStr = this.getNodeString(parent);

        // A comment?
        if ( this.reCommentLine.test(parentStr) ) {
            const head = this.allocTypedNode(NODE_TYPE_COMMENT, parentBeg, parentEnd);
            this.astType = AST_TYPE_COMMENT;
            if ( this.interactive ) {
                this.linkDown(head, this.parseComment(head));
            }
            return head;
        }

        // An extended filter? (or rarely, a comment)
        if ( this.reExtAnchor.test(parentStr) ) {
            const match = this.reExtAnchor.exec(parentStr);
            const matchLen = match[1].length;
            const head = this.allocTypedNode(NODE_TYPE_EXT_RAW, parentBeg, parentEnd);
            this.linkDown(head, this.parseExt(head, parentBeg + match.index, matchLen));
            return head;
        } else if ( parentStr.charCodeAt(0) === 0x23 /* # */ ) {
            const head = this.allocTypedNode(NODE_TYPE_COMMENT, parentBeg, parentEnd);
            this.astType = AST_TYPE_COMMENT;
            return head;
        }

        // Good to know in advance to avoid costly tests later on
        this.hasUppercase = this.reHasUppercaseChar.test(parentStr);
        this.hasUnicode = this.reHasUnicodeChar.test(parentStr);

        // A network filter (probably)
        this.astType = AST_TYPE_NETWORK;

        // Parse inline comment if any
        let tail = 0, tailStart = parentEnd;
        if ( this.hasWhitespace && this.reInlineComment.test(parentStr) ) {
            const match = this.reInlineComment.exec(parentStr);
            tailStart = parentBeg + match.index;
            tail = this.allocTypedNode(NODE_TYPE_COMMENT, tailStart, parentEnd);
        }

        const head = this.allocTypedNode(NODE_TYPE_NET_RAW, parentBeg, tailStart);
        if ( this.linkDown(head, this.parseNet(head)) === 0 ) {
            this.astType = AST_TYPE_UNKNOWN;
            this.addFlags(AST_FLAG_UNSUPPORTED | AST_FLAG_HAS_ERROR);
        }
        if ( tail !== 0 ) {
            this.linkRight(head, tail);
        }
        return head;
    }

    parseComment(parent) {
        const parentStr = this.getNodeString(parent);
        if ( this.rePreparseDirectiveAny.test(parentStr) ) {
            this.astTypeFlavor = AST_TYPE_COMMENT_PREPARSER;
            return this.parsePreparseDirective(parent, parentStr);
        }
        if ( this.reURL.test(parentStr) === false ) { return 0; }
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        const match = this.reURL.exec(parentStr);
        const urlBeg = parentBeg + match.index;
        const urlEnd = urlBeg + match[0].length;
        const head = this.allocTypedNode(NODE_TYPE_COMMENT, parentBeg, urlBeg);
        let next = this.allocTypedNode(NODE_TYPE_COMMENT_URL, urlBeg, urlEnd);
        let prev = this.linkRight(head, next);
        if ( urlEnd !== parentEnd ) {
            next = this.allocTypedNode(NODE_TYPE_COMMENT, urlEnd, parentEnd);
            this.linkRight(prev, next);
        }
        return head;
    }

    parsePreparseDirective(parent, s) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        const match = this.rePreparseDirectiveAny.exec(s);
        const directiveEnd = parentBeg + match[0].length;
        const head = this.allocTypedNode(
            NODE_TYPE_PREPARSE_DIRECTIVE,
            parentBeg,
            directiveEnd
        );
        if ( directiveEnd !== parentEnd ) {
            const type = s.startsWith('!#if ')
                ? NODE_TYPE_PREPARSE_DIRECTIVE_IF_VALUE
                : NODE_TYPE_PREPARSE_DIRECTIVE_VALUE;
            const next = this.allocTypedNode(type, directiveEnd, parentEnd);
            this.linkRight(head, next);
            if ( type === NODE_TYPE_PREPARSE_DIRECTIVE_IF_VALUE ) {
                const rawToken = this.getNodeString(next).trim();
                if ( utils.preparser.evaluateExpr(rawToken) === undefined ) {
                    this.addNodeFlags(next, NODE_FLAG_ERROR);
                    this.addFlags(AST_FLAG_HAS_ERROR);
                    this.astError = AST_ERROR_IF_TOKEN_UNKNOWN;
                }
            }
        }
        return head;
    }

    // Very common, look into fast-tracking such plain pattern:
    // /^[^!#\$\*\^][^#\$\*\^]*[^\$\*\|]$/
    parseNet(parent) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        const parentStr = this.getNodeString(parent);
        const head = this.allocHeadNode();
        let patternBeg = parentBeg;
        let prev = head, next = 0, tail = 0;
        if ( this.reNetException.test(parentStr) ) {
            this.addFlags(AST_FLAG_IS_EXCEPTION);
            next = this.allocTypedNode(NODE_TYPE_NET_EXCEPTION, parentBeg, parentBeg+2);
            prev = this.linkRight(prev, next);
            patternBeg += 2;
        }
        let anchorBeg = this.indexOfNetAnchor(parentStr, patternBeg);
        if ( anchorBeg === -1 ) { return 0; }
        anchorBeg += parentBeg;
        if ( anchorBeg !== parentEnd ) {
            tail = this.allocTypedNode(
                NODE_TYPE_NET_OPTIONS_ANCHOR,
                anchorBeg,
                anchorBeg + 1
            );
            next = this.allocTypedNode(
                NODE_TYPE_NET_OPTIONS,
                anchorBeg + 1,
                parentEnd
            );
            this.addFlags(AST_FLAG_HAS_OPTIONS);
            this.addNodeToRegister(NODE_TYPE_NET_OPTIONS, next);
            this.linkDown(next, this.parseNetOptions(next));
            this.linkRight(tail, next);
        }
        next = this.allocTypedNode(
            NODE_TYPE_NET_PATTERN_RAW,
            patternBeg,
            anchorBeg
        );
        this.addNodeToRegister(NODE_TYPE_NET_PATTERN_RAW, next);
        this.linkDown(next, this.parseNetPattern(next));
        prev = this.linkRight(prev, next);
        if ( tail !== 0 ) {
            this.linkRight(prev, tail);
        }
        if ( this.astType === AST_TYPE_NETWORK ) {
            this.validateNet();
        }
        return this.throwHeadNode(head);
    }

    validateNet() {
        const isException = this.isException();
        let bad = false, realBad = false;
        let abstractTypeCount = 0;
        let behaviorTypeCount = 0;
        let docTypeCount = 0;
        let modifierType = 0;
        let requestTypeCount = 0;
        let unredirectableTypeCount = 0;
        for ( let i = 0, n = this.nodeTypeRegisterPtr; i < n; i++ ) {
            const type = this.nodeTypeRegister[i];
            const targetNode = this.nodeTypeLookupTable[type];
            if ( targetNode === 0 ) { continue; }
            if ( this.badTypes.has(type) ) {
                this.addNodeFlags(NODE_FLAG_ERROR);
                this.addFlags(AST_FLAG_HAS_ERROR);
            }
            const flags = this.getNodeFlags(targetNode);
            if ( (flags & NODE_FLAG_ERROR) !== 0 ) { continue; }
            const isNegated = (flags & NODE_FLAG_IS_NEGATED) !== 0;
            const hasValue = (flags & NODE_FLAG_OPTION_HAS_VALUE) !== 0;
            bad = false; realBad = false;
            switch ( type ) {
                case NODE_TYPE_NET_OPTION_NAME_ALL:
                    realBad = isNegated || hasValue || modifierType !== 0;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_1P:
                case NODE_TYPE_NET_OPTION_NAME_3P:
                    realBad = hasValue;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_BADFILTER:
                case NODE_TYPE_NET_OPTION_NAME_NOOP:
                    realBad = isNegated || hasValue;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_CSS:
                case NODE_TYPE_NET_OPTION_NAME_FONT:
                case NODE_TYPE_NET_OPTION_NAME_IMAGE:
                case NODE_TYPE_NET_OPTION_NAME_MEDIA:
                case NODE_TYPE_NET_OPTION_NAME_OBJECT:
                case NODE_TYPE_NET_OPTION_NAME_OTHER:
                case NODE_TYPE_NET_OPTION_NAME_SCRIPT:
                case NODE_TYPE_NET_OPTION_NAME_XHR:
                    realBad = hasValue;
                    if ( realBad ) { break; }
                    requestTypeCount += 1;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_CNAME:
                    realBad = isException === false || isNegated || hasValue;
                    if ( realBad ) { break; }
                    modifierType = type;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_CSP:
                    realBad = (hasValue || isException) === false ||
                        modifierType !== 0 ||
                        this.reBadCSP.test(
                            this.getNetOptionValue(NODE_TYPE_NET_OPTION_NAME_CSP)
                        );
                    if ( realBad ) { break; }
                    modifierType = type;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_DENYALLOW:
                    realBad = isNegated || hasValue === false ||
                        this.getBranchFromType(NODE_TYPE_NET_OPTION_NAME_FROM) === 0;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_DOC:
                case NODE_TYPE_NET_OPTION_NAME_FRAME:
                    realBad = hasValue;
                    if ( realBad ) { break; }
                    docTypeCount += 1;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_EHIDE:
                case NODE_TYPE_NET_OPTION_NAME_GHIDE:
                case NODE_TYPE_NET_OPTION_NAME_SHIDE:
                    realBad = isNegated || hasValue || modifierType !== 0;
                    if ( realBad ) { break; }
                    behaviorTypeCount += 1;
                    unredirectableTypeCount += 1;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_EMPTY:
                case NODE_TYPE_NET_OPTION_NAME_MP4:
                    realBad = isNegated || hasValue || modifierType !== 0;
                    if ( realBad ) { break; }
                    modifierType = type;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_FROM:
                case NODE_TYPE_NET_OPTION_NAME_METHOD:
                case NODE_TYPE_NET_OPTION_NAME_TO:
                    realBad = isNegated || hasValue === false;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_GENERICBLOCK:
                    bad = true;
                    realBad = isException === false || isNegated || hasValue;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_HEADER:
                    realBad = this.options.filterOnHeaders !== true || isNegated || hasValue === false;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_IMPORTANT:
                    realBad = isException || isNegated || hasValue;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_INLINEFONT:
                case NODE_TYPE_NET_OPTION_NAME_INLINESCRIPT:
                    realBad = hasValue;
                    if ( realBad ) { break; }
                    modifierType = type;
                    unredirectableTypeCount += 1;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_MATCHCASE:
                    realBad = this.isRegexPattern() === false;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_PERMISSIONS:
                    realBad = modifierType !== 0 || (hasValue || isException) === false;
                    if ( realBad ) { break; }
                    modifierType = type;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_PING:
                case NODE_TYPE_NET_OPTION_NAME_WEBSOCKET:
                    realBad = hasValue;
                    if ( realBad ) { break; }
                    requestTypeCount += 1;
                    unredirectableTypeCount += 1;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_POPUNDER:
                case NODE_TYPE_NET_OPTION_NAME_POPUP:
                    realBad = hasValue;
                    if ( realBad ) { break; }
                    abstractTypeCount += 1;
                    unredirectableTypeCount += 1;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_REDIRECT:
                case NODE_TYPE_NET_OPTION_NAME_REDIRECTRULE:
                    realBad = isNegated || (isException || hasValue) === false ||
                        modifierType !== 0;
                    if ( realBad ) { break; }
                    modifierType = type;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_REMOVEPARAM:
                    realBad = isNegated || modifierType !== 0;
                    if ( realBad ) { break; }
                    modifierType = type;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_STRICT1P:
                case NODE_TYPE_NET_OPTION_NAME_STRICT3P:
                    realBad = isNegated || hasValue;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_UNKNOWN:
                    this.astError = AST_ERROR_OPTION_UNKNOWN;
                    realBad = true;
                    break;
                case NODE_TYPE_NET_OPTION_NAME_WEBRTC:
                    realBad = true;
                    break;
                case NODE_TYPE_NET_PATTERN_RAW:
                    realBad = this.hasOptions() === false &&
                        this.getNetPattern().length <= 1;
                    break;
                default:
                    break;
            }
            if ( bad || realBad ) {
                this.addNodeFlags(targetNode, NODE_FLAG_ERROR);
            }
            if ( realBad ) {
                this.addFlags(AST_FLAG_HAS_ERROR);
            }
        }
        switch ( modifierType ) {
            case NODE_TYPE_NET_OPTION_NAME_CNAME:
                realBad = abstractTypeCount || behaviorTypeCount || requestTypeCount;
                break;
            case NODE_TYPE_NET_OPTION_NAME_CSP:
            case NODE_TYPE_NET_OPTION_NAME_PERMISSIONS:
                realBad = abstractTypeCount || behaviorTypeCount || requestTypeCount;
                break;
            case NODE_TYPE_NET_OPTION_NAME_INLINEFONT:
            case NODE_TYPE_NET_OPTION_NAME_INLINESCRIPT:
                realBad = behaviorTypeCount;
                break;
            case NODE_TYPE_NET_OPTION_NAME_EMPTY:
                realBad = abstractTypeCount || behaviorTypeCount;
                break;
            case NODE_TYPE_NET_OPTION_NAME_MEDIA:
            case NODE_TYPE_NET_OPTION_NAME_MP4:
                realBad = abstractTypeCount || behaviorTypeCount || docTypeCount || requestTypeCount;
                break;
            case NODE_TYPE_NET_OPTION_NAME_REDIRECT:
            case NODE_TYPE_NET_OPTION_NAME_REDIRECTRULE: {
                realBad = abstractTypeCount || behaviorTypeCount || unredirectableTypeCount;
                break;
            }
            case NODE_TYPE_NET_OPTION_NAME_REMOVEPARAM:
                realBad = abstractTypeCount || behaviorTypeCount;
                break;
            default:
                break;
        }
        if ( realBad ) {
            const targetNode = this.getBranchFromType(modifierType);
            this.addNodeFlags(targetNode, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
        }
    }

    indexOfNetAnchor(s, start = 0) {
        const end = s.length;
        if ( end === start ) { return end; }
        let j = s.lastIndexOf('$');
        if ( j === -1 ) { return end; }
        if ( (j+1) === end ) { return end; }
        for (;;) {
            const before = s.charCodeAt(j-1);
            if ( j !== start && before === 0x24 /* $ */ ) { return -1; }
            const after = s.charCodeAt(j+1);
            if (
                after !== 0x29 /* ) */ &&
                after !== 0x2F /* / */ &&
                after !== 0x7C /* | */ &&
                before !== 0x5C /* \ */
            ) {
                return j;
            }
            if ( j <= start ) { break; }
            j = s.lastIndexOf('$', j-1);
            if ( j === -1 ) { break; }
        }
        return end;
    }

    parseNetPattern(parent) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];

        // Empty pattern
        if ( parentEnd === parentBeg ) {
            this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_ANY;
            const node = this.allocTypedNode(
                NODE_TYPE_NET_PATTERN,
                parentBeg,
                parentEnd
            );
            this.addNodeToRegister(NODE_TYPE_NET_PATTERN, node);
            this.setNodeTransform(node, '*');
            return node;
        }

        const head = this.allocHeadNode();
        let prev = head, next = 0, tail = 0;
        let pattern = this.getNodeString(parent);
        const hasWildcard = pattern.includes('*');
        const c1st = pattern.charCodeAt(0);
        const c2nd = pattern.charCodeAt(1) || 0;
        const clast = exCharCodeAt(pattern, -1);

        // Common case: Easylist syntax-based hostname
        if (
            hasWildcard === false &&
            c1st === 0x7C /* | */ && c2nd === 0x7C /* | */ &&
            clast === 0x5E /* ^ */ &&
            this.isAdblockHostnamePattern(pattern)
        ) {
            this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_HOSTNAME;
            this.addFlags(
                AST_FLAG_NET_PATTERN_LEFT_HNANCHOR |
                AST_FLAG_NET_PATTERN_RIGHT_PATHANCHOR
            );
            next = this.allocTypedNode(
                NODE_TYPE_NET_PATTERN_LEFT_HNANCHOR,
                parentBeg,
                parentBeg + 2
            );
            prev = this.linkRight(prev, next);
            next = this.allocTypedNode(
                NODE_TYPE_NET_PATTERN,
                parentBeg + 2,
                parentEnd - 1
            );
            pattern = pattern.slice(2, -1);
            const normal = this.hasUnicode
                ? this.normalizeHostnameValue(pattern)
                : pattern;
            if ( normal !== undefined && normal !== pattern ) {
                this.setNodeTransform(next, normal);
            }
            this.addNodeToRegister(NODE_TYPE_NET_PATTERN, next);
            prev = this.linkRight(prev, next);
            next = this.allocTypedNode(
                NODE_TYPE_NET_PATTERN_PART_SPECIAL,
                parentEnd - 1,
                parentEnd
            );
            this.linkRight(prev, next);
            return this.throwHeadNode(head);
        }

        let patternBeg = parentBeg;
        let patternEnd = parentEnd;

        // Hosts file entry?
        if (
            this.hasWhitespace &&
            this.isException() === false &&
            this.hasOptions() === false &&
            this.reHostsSink.test(pattern)
        ) {
            const match = this.reHostsSink.exec(pattern);
            patternBeg += match[0].length;
            pattern = pattern.slice(patternBeg);
            next = this.allocTypedNode(NODE_TYPE_IGNORE, parentBeg, patternBeg);
            prev = this.linkRight(prev, next);
            if (
                this.reHostsRedirect.test(pattern) ||
                this.reHostnameAscii.test(pattern) === false
            ) {
                this.astType = AST_TYPE_NONE;
                this.addFlags(AST_FLAG_IGNORE);
                next = this.allocTypedNode(NODE_TYPE_IGNORE, patternBeg, parentEnd);
                prev = this.linkRight(prev, next);
                return this.throwHeadNode(head);
            }
            this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_HOSTNAME;
            this.addFlags(
                AST_FLAG_NET_PATTERN_LEFT_HNANCHOR |
                AST_FLAG_NET_PATTERN_RIGHT_PATHANCHOR
            );
            next = this.allocTypedNode(
                NODE_TYPE_NET_PATTERN,
                patternBeg,
                parentEnd
            );
            this.addNodeToRegister(NODE_TYPE_NET_PATTERN, next);
            this.linkRight(prev, next);
            return this.throwHeadNode(head);
        }

        // Regex?
        if (
            c1st === 0x2F /* / */ && clast === 0x2F /* / */ &&
            pattern.length > 2
        ) {
            this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_REGEX;
            const normal = this.normalizeRegexPattern(pattern);
            next = this.allocTypedNode(
                NODE_TYPE_NET_PATTERN,
                patternBeg,
                patternEnd
            );
            this.addNodeToRegister(NODE_TYPE_NET_PATTERN, next);
            if ( normal !== '' ) {
                if ( normal !== pattern ) {
                    this.setNodeTransform(next, normal);
                }
                if ( this.interactive ) {
                    const tokenizable = utils.regex.toTokenizableStr(normal);
                    if ( this.reGoodRegexToken.test(tokenizable) === false ) {
                        this.addNodeFlags(next, NODE_FLAG_PATTERN_UNTOKENIZABLE);
                    }
                }
            } else {
                this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_BAD;
                this.astError = AST_ERROR_REGEX;
                this.addFlags(AST_FLAG_HAS_ERROR);
                this.addNodeFlags(next, NODE_FLAG_ERROR);
            }
            this.linkRight(prev, next);
            return this.throwHeadNode(head);
        }

        // Left anchor
        if ( c1st === 0x7C /* '|' */ ) {
            if ( c2nd === 0x7C /* '|' */ ) {
                const type = this.isTokenCharCode(pattern.charCodeAt(2) || 0)
                    ? NODE_TYPE_NET_PATTERN_LEFT_HNANCHOR
                    : NODE_TYPE_IGNORE;
                next = this.allocTypedNode(type, patternBeg, patternBeg+2);
                if ( type === NODE_TYPE_NET_PATTERN_LEFT_HNANCHOR ) {
                    this.addFlags(AST_FLAG_NET_PATTERN_LEFT_HNANCHOR);
                }
                patternBeg += 2;
                pattern = pattern.slice(2);
            } else {
                const type = this.isTokenCharCode(c2nd)
                    ? NODE_TYPE_NET_PATTERN_LEFT_ANCHOR
                    : NODE_TYPE_IGNORE;
                next = this.allocTypedNode(type, patternBeg, patternBeg+1);
                if ( type === NODE_TYPE_NET_PATTERN_LEFT_ANCHOR ) {
                    this.addFlags(AST_FLAG_NET_PATTERN_LEFT_ANCHOR);
                }
                patternBeg += 1;
                pattern = pattern.slice(1);
            }
            prev = this.linkRight(prev, next);
            if ( patternBeg === patternEnd ) {
                this.addNodeFlags(next, NODE_FLAG_IGNORE);
            }
        }

        // Right anchor
        if ( exCharCodeAt(pattern, -1) === 0x7C /* | */ ) {
            const type = exCharCodeAt(pattern, -2) !== 0x2A /* * */
                ? NODE_TYPE_NET_PATTERN_RIGHT_ANCHOR
                : NODE_TYPE_IGNORE;
            tail = this.allocTypedNode(type, patternEnd-1, patternEnd);
            if ( type === NODE_TYPE_NET_PATTERN_RIGHT_ANCHOR ) {
                this.addFlags(AST_FLAG_NET_PATTERN_RIGHT_ANCHOR);
            }
            patternEnd -= 1;
            pattern = pattern.slice(0, -1);
            if ( patternEnd === patternBeg ) {
                this.addNodeFlags(tail, NODE_FLAG_IGNORE);
            }
        }

        // Ignore pointless leading wildcards
        if ( hasWildcard && this.rePointlessLeadingWildcards.test(pattern) ) {
            const match = this.rePointlessLeadingWildcards.exec(pattern);
            const ignoreLen = match[1].length;
            next = this.allocTypedNode(
                NODE_TYPE_IGNORE,
                patternBeg,
                patternBeg + ignoreLen
            );
            prev = this.linkRight(prev, next);
            patternBeg += ignoreLen;
            pattern = pattern.slice(ignoreLen);
        }

        // Ignore pointless trailing separators
        if ( this.rePointlessTrailingSeparator.test(pattern) ) {
            const match = this.rePointlessTrailingSeparator.exec(pattern);
            const ignoreLen = match[1].length;
            next = this.allocTypedNode(
                NODE_TYPE_IGNORE,
                patternEnd - ignoreLen,
                patternEnd
            );
            patternEnd -= ignoreLen;
            pattern = pattern.slice(0, -ignoreLen);
            if ( tail !== 0 ) { this.linkRight(next, tail); }
            tail = next;
        }

        // Ignore pointless trailing wildcards. Exception: when removing the
        // trailing wildcard make the pattern look like a regex.
        if ( hasWildcard && this.rePointlessTrailingWildcards.test(pattern) ) {
            const match = this.rePointlessTrailingWildcards.exec(pattern);
            const ignoreLen = match[1].length;
            const needWildcard = pattern.charCodeAt(0) === 0x2F &&
                exCharCodeAt(pattern, -ignoreLen-1) === 0x2F;
            const goodWildcardBeg = patternEnd - ignoreLen;
            const badWildcardBeg = goodWildcardBeg + (needWildcard ? 1 : 0);
            if ( badWildcardBeg !== patternEnd ) {
                next = this.allocTypedNode(
                    NODE_TYPE_IGNORE,
                    badWildcardBeg,
                    patternEnd
                );
                if ( tail !== 0 ) {this.linkRight(next, tail); }
                tail = next;
            }
            if ( goodWildcardBeg !== badWildcardBeg ) {
                next = this.allocTypedNode(
                    NODE_TYPE_NET_PATTERN_PART_SPECIAL,
                    goodWildcardBeg,
                    badWildcardBeg
                );
                if ( tail !== 0 ) { this.linkRight(next, tail); }
                tail = next;
            }
            patternEnd -= ignoreLen;
            pattern = pattern.slice(0, -ignoreLen);
        }

        const patternHasWhitespace = this.hasWhitespace &&
            this.reHasWhitespaceChar.test(pattern);
        const needNormalization = this.needPatternNormalization(pattern);
        const normal = needNormalization
            ? this.normalizePattern(pattern)
            : pattern;
        next = this.allocTypedNode(NODE_TYPE_NET_PATTERN, patternBeg, patternEnd);
        if ( patternHasWhitespace || normal === undefined ) {
            this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_BAD;
            this.addFlags(AST_FLAG_HAS_ERROR);
            this.astError = AST_ERROR_PATTERN;
            this.addNodeFlags(next, NODE_FLAG_ERROR);
        } else if ( normal === '*' ) {
            this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_ANY;
        } else if ( this.reHostnameAscii.test(normal) ) {
            this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_HOSTNAME;
        } else if ( this.reHasPatternSpecialChars.test(normal) ) {
            this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_GENERIC;
        } else {
            this.astTypeFlavor = AST_TYPE_NETWORK_PATTERN_PLAIN;
        }
        this.addNodeToRegister(NODE_TYPE_NET_PATTERN, next);
        if ( needNormalization && normal !== undefined ) {
            this.setNodeTransform(next, normal);
        }
        if ( this.interactive ) {
            this.linkDown(next, this.parsePatternParts(next, pattern));
        }
        prev = this.linkRight(prev, next);

        if ( tail !== 0 ) {
            this.linkRight(prev, tail);
        }
        return this.throwHeadNode(head);
    }

    isAdblockHostnamePattern(pattern) {
        if ( this.hasUnicode ) {
            return this.reHnAnchoredHostnameUnicode.test(pattern);
        }
        return this.reHnAnchoredHostnameAscii.test(pattern);
    }

    parsePatternParts(parent, pattern) {
        if ( pattern.length === 0 ) { return 0; }
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const matches = pattern.matchAll(this.rePatternAllSpecialChars);
        const head = this.allocHeadNode();
        let prev = head, next = 0;
        let plainPartBeg = 0;
        for ( const match of matches ) {
            const plainPartEnd = match.index;
            if ( plainPartEnd !== plainPartBeg ) {
                next = this.allocTypedNode(
                    NODE_TYPE_NET_PATTERN_PART,
                    parentBeg + plainPartBeg,
                    parentBeg + plainPartEnd
                );
                prev = this.linkRight(prev, next);
            }
            plainPartBeg = plainPartEnd + match[0].length;
            const type = match[0].charCodeAt(0) < 0x80
                ? NODE_TYPE_NET_PATTERN_PART_SPECIAL
                : NODE_TYPE_NET_PATTERN_PART_UNICODE;
            next = this.allocTypedNode(
                type,
                parentBeg + plainPartEnd,
                parentBeg + plainPartBeg
            );
            prev = this.linkRight(prev, next);
        }
        if ( plainPartBeg !== pattern.length ) {
            next = this.allocTypedNode(
                NODE_TYPE_NET_PATTERN_PART,
                parentBeg + plainPartBeg,
                parentBeg + pattern.length
            );
            this.linkRight(prev, next);
        }
        return this.throwHeadNode(head);
    }

    // https://github.com/uBlockOrigin/uBlock-issues/issues/1118#issuecomment-650730158
    //   Be ready to deal with non-punycode-able Unicode characters.
    // https://github.com/uBlockOrigin/uBlock-issues/issues/772
    //   Encode Unicode characters beyond the hostname part.
    // Prepend with '*' character to prevent the browser API from refusing to
    // punycode -- this occurs when the extracted label starts with a dash.
    needPatternNormalization(pattern) {
        return pattern.length === 0 || this.hasUppercase || this.hasUnicode;
    }

    normalizePattern(pattern) {
        if ( pattern.length === 0 ) { return '*'; }
        if ( this.reHasInvalidChar.test(pattern) ) { return; }
        let normal = pattern.toLowerCase();
        if ( this.hasUnicode === false ) { return normal; }
        // Punycode hostname part of the pattern.
        if ( this.reHostnamePatternPart.test(normal) ) {
            const match = this.reHostnamePatternPart.exec(normal);
            const hn = match[0].replace(this.reHostnameLabel, s => {
                if ( this.reHasUnicodeChar.test(s) === false ) { return s; }
                if ( s.charCodeAt(0) === 0x2D /* - */ ) { s = '*' + s; }
                return this.normalizeHostnameValue(s, 0b0001) || s;
            });
            normal = hn + normal.slice(match.index + match[0].length);
        }
        if ( this.reHasUnicodeChar.test(normal) === false ) { return normal; }
        // Percent-encode remaining Unicode characters.
        try {
            normal = normal.replace(this.reUnicodeChars, s =>
                encodeURIComponent(s).toLowerCase()
            );
        } catch (ex) {
            return;
        }
        return normal;
    }

    getNetPattern() {
        const node = this.nodeTypeLookupTable[NODE_TYPE_NET_PATTERN];
        return this.getNodeTransform(node);
    }

    isAnyPattern() {
        return this.astTypeFlavor === AST_TYPE_NETWORK_PATTERN_ANY;
    }

    isHostnamePattern() {
        return this.astTypeFlavor === AST_TYPE_NETWORK_PATTERN_HOSTNAME;
    }

    isRegexPattern() {
        return this.astTypeFlavor === AST_TYPE_NETWORK_PATTERN_REGEX;
    }

    isPlainPattern() {
        return this.astTypeFlavor === AST_TYPE_NETWORK_PATTERN_PLAIN;
    }

    isGenericPattern() {
        return this.astTypeFlavor === AST_TYPE_NETWORK_PATTERN_GENERIC;
    }

    isBadPattern() {
        return this.astTypeFlavor === AST_TYPE_NETWORK_PATTERN_BAD;
    }

    parseNetOptions(parent) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        if ( parentEnd === parentBeg ) { return 0; }
        const s = this.getNodeString(parent);
        const optionsEnd = s.length;
        const head = this.allocHeadNode();
        let prev = head, next = 0;
        let optionBeg = 0, optionEnd = 0;
        let emptyOption = false, badComma = false;
        while ( optionBeg !== optionsEnd ) {
            optionEnd = this.endOfNetOption(s, optionBeg);
            next = this.allocTypedNode(
                NODE_TYPE_NET_OPTION_RAW,
                parentBeg + optionBeg,
                parentBeg + optionEnd
            );
            emptyOption = optionEnd === optionBeg;
            this.linkDown(next, this.parseNetOption(next));
            prev = this.linkRight(prev, next);
            if ( optionEnd === optionsEnd ) { break; }
            optionBeg = optionEnd + 1;
            next = this.allocTypedNode(
                NODE_TYPE_NET_OPTION_SEPARATOR,
                parentBeg + optionEnd,
                parentBeg + optionBeg
            );
            badComma = optionBeg === optionsEnd;
            prev = this.linkRight(prev, next);
            if ( emptyOption || badComma ) {
                this.addNodeFlags(next, NODE_FLAG_ERROR);
                this.addFlags(AST_FLAG_HAS_ERROR);
            }
        }
        this.linkRight(prev,
            this.allocSentinelNode(NODE_TYPE_NET_OPTION_SENTINEL, parentEnd)
        );
        return this.throwHeadNode(head);
    }

    endOfNetOption(s, beg) {
        this.reNetOptionComma.lastIndex = beg;
        const match = this.reNetOptionComma.exec(s);
        return match !== null ? match.index : s.length;
    }

    parseNetOption(parent) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const s = this.getNodeString(parent);
        const optionEnd = s.length;
        const head = this.allocHeadNode();
        let prev = head, next = 0;
        let nameBeg = 0;
        if ( s.charCodeAt(0) === 0x7E ) {
            this.addNodeFlags(parent, NODE_FLAG_IS_NEGATED);
            next = this.allocTypedNode(
                NODE_TYPE_NET_OPTION_NAME_NOT,
                parentBeg,
                parentBeg+1
            );
            prev = this.linkRight(prev, next);
            nameBeg += 1;
        }
        const equalPos = s.indexOf('=');
        const nameEnd = equalPos !== -1 ? equalPos : s.length;
        const name = s.slice(nameBeg, nameEnd);
        let nodeOptionType = nodeTypeFromOptionName.get(name);
        if ( nodeOptionType === undefined ) {
            nodeOptionType = this.reNoopOption.test(name)
                ? NODE_TYPE_NET_OPTION_NAME_NOOP
                : NODE_TYPE_NET_OPTION_NAME_UNKNOWN;
        }
        next = this.allocTypedNode(
            nodeOptionType,
            parentBeg + nameBeg,
            parentBeg + nameEnd
        );
        if (
            nodeOptionType !== NODE_TYPE_NET_OPTION_NAME_NOOP &&
            this.getBranchFromType(nodeOptionType) !== 0
        ) {
            this.addNodeFlags(parent, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
            this.astError = AST_ERROR_OPTION_DUPLICATE;
        } else {
            this.addNodeToRegister(nodeOptionType, parent);
        }
        prev = this.linkRight(prev, next);
        if ( equalPos === -1 ) {
            return this.throwHeadNode(head);
        }
        const valueBeg = equalPos + 1;
        next = this.allocTypedNode(
            NODE_TYPE_NET_OPTION_ASSIGN,
            parentBeg + equalPos,
            parentBeg + valueBeg
        );
        prev = this.linkRight(prev, next);
        if ( (equalPos+1) === optionEnd ) {
            this.addNodeFlags(parent, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
            return this.throwHeadNode(head);
        }
        this.addNodeFlags(parent, NODE_FLAG_OPTION_HAS_VALUE);
        next = this.allocTypedNode(
            NODE_TYPE_NET_OPTION_VALUE,
            parentBeg + valueBeg,
            parentBeg + optionEnd
        );
        switch ( nodeOptionType ) {
            case NODE_TYPE_NET_OPTION_NAME_DENYALLOW:
                this.linkDown(next, this.parseDomainList(next, '|'), 0b00000);
                break;
            case NODE_TYPE_NET_OPTION_NAME_FROM:
            case NODE_TYPE_NET_OPTION_NAME_TO:
                this.linkDown(next, this.parseDomainList(next, '|', 0b11010));
                break;
            default:
                break;
        }
        this.linkRight(prev, next);
        return this.throwHeadNode(head);
    }

    getNetOptionValue(type) {
        if ( this.nodeTypeRegister.includes(type) === false ) { return ''; }
        const optionNode = this.nodeTypeLookupTable[type];
        if ( optionNode === 0 ) { return ''; }
        const valueNode = this.findDescendantByType(optionNode, NODE_TYPE_NET_OPTION_VALUE);
        if ( valueNode === 0 ) { return ''; }
        return this.getNodeTransform(valueNode);
    }

    parseDomainList(parent, separator, mode = 0b00000) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        const containerNode = this.allocTypedNode(
            NODE_TYPE_OPTION_VALUE_DOMAIN_LIST,
            parentBeg,
            parentEnd
        );
        if ( parentEnd === parentBeg ) { return containerNode; }
        const separatorCode = separator.charCodeAt(0);
        const listNode = this.allocHeadNode();
        let prev = listNode;
        let domainNode = 0;
        let separatorNode = 0;
        const s = this.getNodeString(parent);
        const listEnd = s.length;
        let beg = 0, end = 0, c = 0;
        while ( beg < listEnd ) {
            c = s.charCodeAt(beg);
            if ( c === 0x7E /* ~ */ ) {
                c = s.charCodeAt(beg+1) || 0;
            }
            if ( c !== 0x2F /* / */ ) {
                end = s.indexOf(separator, beg);
            } else {
                end = s.indexOf('/', beg+1);
                end = s.indexOf(separator, end !== -1 ? end+1 : beg);
            }
            if ( end === -1 ) { end = listEnd; }
            if ( end !== beg ) {
                domainNode = this.allocTypedNode(
                    NODE_TYPE_OPTION_VALUE_DOMAIN_RAW,
                    parentBeg + beg,
                    parentBeg + end
                );
                this.linkDown(domainNode, this.parseDomain(domainNode, mode));
                prev = this.linkRight(prev, domainNode);
            } else {
                domainNode = 0;
                if ( separatorNode !== 0 ) {
                    this.addNodeFlags(separatorNode, NODE_FLAG_ERROR);
                    this.addFlags(AST_FLAG_HAS_ERROR);
                }
            }
            if ( s.charCodeAt(end) === separatorCode ) {
                beg = end;
                end += 1;
                separatorNode = this.allocTypedNode(
                    NODE_TYPE_OPTION_VALUE_SEPARATOR,
                    parentBeg + beg,
                    parentBeg + end
                );
                prev = this.linkRight(prev, separatorNode);
                if ( domainNode === 0 ) {
                    this.addNodeFlags(separatorNode, NODE_FLAG_ERROR);
                    this.addFlags(AST_FLAG_HAS_ERROR);
                }
            } else {
                separatorNode = 0;
            }
            beg = end;
        }
        // Dangling separator node
        if ( separatorNode !== 0 ) {
            this.addNodeFlags(separatorNode, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
        }
        this.linkDown(containerNode, this.throwHeadNode(listNode));
        return containerNode;
    }

    parseDomain(parent, mode = 0b0000) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        let head = 0, next = 0;
        let beg = parentBeg;
        const c = this.charCodeAt(beg);
        if ( c === 0x7E /* ~ */ ) {
            this.addNodeFlags(parent, NODE_FLAG_IS_NEGATED);
            head = this.allocTypedNode(NODE_TYPE_OPTION_VALUE_NOT, beg, beg + 1);
            if ( (mode & 0b1000) === 0 ) {
                this.addNodeFlags(parent, NODE_FLAG_ERROR);
            }
            beg += 1;
        }
        if ( beg !== parentEnd ) {
            next = this.allocTypedNode(NODE_TYPE_OPTION_VALUE_DOMAIN, beg, parentEnd);
            const hn = this.normalizeDomainValue(this.getNodeString(next), mode);
            if ( hn !== undefined ) {
                if ( hn !== '' ) {
                    this.setNodeTransform(next, hn);
                } else {
                    this.addNodeFlags(parent, NODE_FLAG_ERROR);
                    this.addFlags(AST_FLAG_HAS_ERROR);
                    this.astError = AST_ERROR_DOMAIN_NAME;
                }
            }
            if ( head === 0 ) {
                head = next;
            } else {
                this.linkRight(head, next);
            }
        } else {
            this.addNodeFlags(parent, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
        }
        return head;
    }

    // mode bits:
    //   0b00001: can use wildcard at any position
    //   0b00010: can use entity-based hostnames
    //   0b00100: can use single wildcard
    //   0b01000: can be negated
    //   0b10000: can be a regex
    normalizeDomainValue(s, modeBits) {
        if ( (modeBits & 0b10000) === 0 ||
            s.length <= 2 ||
            s.charCodeAt(0) !== 0x2F /* / */ ||
            exCharCodeAt(s, -1) !== 0x2F /* / */
        ) {
            return this.normalizeHostnameValue(s, modeBits);
        }
        const source = this.normalizeRegexPattern(s);
        if ( source === '' ) { return ''; }
        return `/${source}/`;
    }

    parseExt(parent, anchorBeg, anchorLen) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        const head = this.allocHeadNode();
        let prev = head, next = 0;
        this.astType = AST_TYPE_EXTENDED;
        this.addFlags(this.extFlagsFromAnchor(anchorBeg));
        if ( anchorBeg > parentBeg ) {
            next = this.allocTypedNode(
                NODE_TYPE_EXT_OPTIONS,
                parentBeg,
                anchorBeg
            );
            this.addFlags(AST_FLAG_HAS_OPTIONS);
            this.addNodeToRegister(NODE_TYPE_EXT_OPTIONS, next);
            this.linkDown(next, this.parseDomainList(next, ',', 0b11110));
            prev = this.linkRight(prev, next);
        }
        next = this.allocTypedNode(
            NODE_TYPE_EXT_OPTIONS_ANCHOR,
            anchorBeg,
            anchorBeg + anchorLen
        );
        this.addNodeToRegister(NODE_TYPE_EXT_OPTIONS_ANCHOR, next);
        prev = this.linkRight(prev, next);
        next = this.allocTypedNode(
            NODE_TYPE_EXT_PATTERN_RAW,
            anchorBeg + anchorLen,
            parentEnd
        );
        this.addNodeToRegister(NODE_TYPE_EXT_PATTERN_RAW, next);
        const down = this.parseExtPattern(next);
        if ( down !== 0 ) {
            this.linkDown(next, down);
        } else {
            this.addNodeFlags(next, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
        }
        this.linkRight(prev, next);
        this.validateExt();
        return this.throwHeadNode(head);
    }

    extFlagsFromAnchor(anchorBeg) {
        let c = this.charCodeAt(anchorBeg+1) ;
        if ( c === 0x23 /* # */ ) { return 0; }
        if ( c === 0x25 /* % */ ) { return AST_FLAG_EXT_SCRIPTLET_ADG; }
        if ( c === 0x3F /* ? */ ) { return AST_FLAG_EXT_STRONG; }
        if ( c === 0x24 /* $ */ ) {
            c = this.charCodeAt(anchorBeg+2);
            if ( c === 0x23 /* # */ ) { return AST_FLAG_EXT_STYLE; }
            if ( c === 0x3F /* ? */ ) {
                return AST_FLAG_EXT_STYLE | AST_FLAG_EXT_STRONG;
            }
        }
        if ( c === 0x40 /* @ */ ) {
            return AST_FLAG_IS_EXCEPTION | this.extFlagsFromAnchor(anchorBeg+1);
        }
        return AST_FLAG_UNSUPPORTED | AST_FLAG_HAS_ERROR;
    }

    validateExt() {
        const isException = this.isException();
        let realBad = false;
        for ( let i = 0, n = this.nodeTypeRegisterPtr; i < n; i++ ) {
            const type = this.nodeTypeRegister[i];
            const targetNode = this.nodeTypeLookupTable[type];
            if ( targetNode === 0 ) { continue; }
            const flags = this.getNodeFlags(targetNode);
            if ( (flags & NODE_FLAG_ERROR) !== 0 ) { continue; }
            realBad = false;
            switch ( type ) {
                case NODE_TYPE_EXT_PATTERN_RESPONSEHEADER:
                    const pattern = this.getNodeString(targetNode);
                    realBad =
                        pattern !== '' && removableHTTPHeaders.has(pattern) === false ||
                        pattern === '' && isException === false;
                    break;
                default:
                    break;
            }
            if ( realBad ) {
                this.addNodeFlags(targetNode, NODE_FLAG_ERROR);
                this.addFlags(AST_FLAG_HAS_ERROR);
            }
        }
    }

    parseExtPattern(parent) {
        const c = this.charCodeAt(this.nodes[parent+NODE_BEG_INDEX]);
        // ##+js(...)
        if ( c === 0x2B /* + */ ) {
            const s = this.getNodeString(parent);
            if ( /^\+js\(.*\)$/.exec(s) !== null ) {
                this.astTypeFlavor = AST_TYPE_EXTENDED_SCRIPTLET;
                return this.parseExtPatternScriptlet(parent);
            }
        }
        // #%#//scriptlet(...)
        if ( this.getFlags(AST_FLAG_EXT_SCRIPTLET_ADG) ) {
            const s = this.getNodeString(parent);
            if ( /^\/\/scriptlet\(.*\)$/.exec(s) !== null ) {
                this.astTypeFlavor = AST_TYPE_EXTENDED_SCRIPTLET;
                return this.parseExtPatternScriptlet(parent);
            }
            return 0;
        }
        // ##^... | ##^responseheader(...)
        if ( c === 0x5E /* ^ */ ) {
            const s = this.getNodeString(parent);
            if ( this.reResponseheaderPattern.test(s) ) {
                this.astTypeFlavor = AST_TYPE_EXTENDED_RESPONSEHEADER;
                return this.parseExtPatternResponseheader(parent);
            }
            this.astTypeFlavor = AST_TYPE_EXTENDED_HTML;
            return this.parseExtPatternHtml(parent);
        }
        // ##...
        this.astTypeFlavor = AST_TYPE_EXTENDED_COSMETIC;
        return this.parseExtPatternCosmetic(parent);
    }

    parseExtPatternScriptlet(parent) {
        const beg = this.nodes[parent+NODE_BEG_INDEX];
        const end = this.nodes[parent+NODE_END_INDEX];
        const s = this.getNodeString(parent);
        const rawArg0 = beg + (s.startsWith('+js') ? 4 : 12);
        const rawArg1 = end - 1;
        const head = this.allocTypedNode(NODE_TYPE_EXT_DECORATION, beg, rawArg0);
        let prev = head, next = 0;
        next = this.allocTypedNode(NODE_TYPE_EXT_PATTERN_SCRIPTLET, rawArg0, rawArg1);
        this.addNodeToRegister(NODE_TYPE_EXT_PATTERN_SCRIPTLET, next);
        this.linkDown(next, this.parseExtPatternScriptletArgs(next));
        prev = this.linkRight(prev, next);
        next = this.allocTypedNode(NODE_TYPE_EXT_DECORATION, rawArg1, end);
        this.linkRight(prev, next);
        return head;
    }

    parseExtPatternScriptletArgs(parent) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        if ( parentEnd === parentBeg ) { return 0; }
        const head = this.allocHeadNode();
        let prev = head, next = 0;
        const s = this.getNodeString(parent);
        const argsEnd = s.length;
        // token
        const details = this.parseExtPatternScriptletArg(s, 0);
        if ( details.argBeg > 0 ) {
            next = this.allocTypedNode(
                NODE_TYPE_EXT_DECORATION,
                parentBeg,
                parentBeg + details.argBeg
            );
            prev = this.linkRight(prev, next);
        }
        const token = s.slice(details.argBeg, details.argEnd);
        const tokenEnd = details.argEnd - (token.endsWith('.js') ? 3 : 0);
        next = this.allocTypedNode(
            NODE_TYPE_EXT_PATTERN_SCRIPTLET_TOKEN,
            parentBeg + details.argBeg,
            parentBeg + tokenEnd
        );
        if ( details.failed ) {
            this.addNodeFlags(next, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
        }
        prev = this.linkRight(prev, next);
        if ( tokenEnd < details.argEnd ) {
            next = this.allocTypedNode(
                NODE_TYPE_IGNORE,
                parentBeg + tokenEnd,
                parentBeg + details.argEnd
            );
            prev = this.linkRight(prev, next);
        }
        if ( details.quoteEnd < argsEnd ) {
            next = this.allocTypedNode(
                NODE_TYPE_EXT_DECORATION,
                parentBeg + details.argEnd,
                parentBeg + details.separatorEnd
            );
            prev = this.linkRight(prev, next);
        }
        // all args
        next = this.allocTypedNode(
            NODE_TYPE_EXT_PATTERN_SCRIPTLET_ARGS,
            parentBeg + details.separatorEnd,
            parentBeg + argsEnd
        );
        this.linkDown(next, this.parseExtPatternScriptletArglist(next));
        prev = this.linkRight(prev, next);
        return this.throwHeadNode(head);
    }

    parseExtPatternScriptletArglist(parent) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        if ( parentEnd === parentBeg ) { return 0; }
        const s = this.getNodeString(parent);
        const argsEnd = s.length;
        const head = this.allocHeadNode();
        let prev = head, next = 0;
        let decorationBeg = 0;
        let i = 0;
        for (;;) {
            const details = this.parseExtPatternScriptletArg(s, i);
            if ( decorationBeg < details.argBeg ) {
                next = this.allocTypedNode(
                    NODE_TYPE_EXT_DECORATION,
                    parentBeg + decorationBeg,
                    parentBeg + details.argBeg
                );
                prev = this.linkRight(prev, next);
            }
            if ( i === argsEnd ) { break; }
            next = this.allocTypedNode(
                NODE_TYPE_EXT_PATTERN_SCRIPTLET_ARG,
                parentBeg + details.argBeg,
                parentBeg + details.argEnd
            );
            if ( details.transform ) {
                this.setNodeTransform(next, this.normalizeScriptletArg(
                    s.slice(details.argBeg, details.argEnd),
                    details.separatorCode
                ));
            }
            prev = this.linkRight(prev, next);
            if ( details.failed ) {
                this.addNodeFlags(next, NODE_FLAG_ERROR);
                this.addFlags(AST_FLAG_HAS_ERROR);
            }
            decorationBeg = details.argEnd;
            i = details.separatorEnd;
        }
        return this.throwHeadNode(head);
    }

    parseExtPatternScriptletArg(pattern, beg = 0) {
        if ( this.parseExtPatternScriptletArg.details === undefined ) {
            this.parseExtPatternScriptletArg.details = {
                quoteBeg: 0, argBeg: 0, argEnd: 0, quoteEnd: 0,
                separatorCode: 0, separatorBeg: 0, separatorEnd: 0,
                transform: false, failed: false,
            };
        }
        const details = this.parseExtPatternScriptletArg.details;
        const len = pattern.length;
        details.quoteBeg = beg + this.leftWhitespaceCount(pattern.slice(beg));
        details.failed = false;
        const qc = pattern.charCodeAt(details.quoteBeg);
        if ( qc === 0x22 /* " */ || qc === 0x27 /* ' */ ) {
            details.separatorCode = qc;
            details.argBeg = details.argEnd = details.quoteBeg + 1;
            details.transform = false;
            this.indexOfNextScriptletArgSeparator(pattern, details);
            if ( details.argEnd !== len ) {
                details.quoteEnd = details.argEnd + 1;
                details.separatorBeg = details.separatorEnd = details.quoteEnd;
                details.separatorEnd += this.leftWhitespaceCount(pattern.slice(details.quoteEnd));
                if ( details.separatorEnd === len ) { return details; }
                if ( pattern.charCodeAt(details.separatorEnd) === 0x2C ) {
                    details.separatorEnd += 1;
                    return details;
                }
            }
        }
        details.separatorCode = 0x2C /* , */;
        details.argBeg = details.argEnd = details.quoteBeg;
        details.transform = false;
        this.indexOfNextScriptletArgSeparator(pattern, details);
        details.separatorBeg = details.separatorEnd = details.argEnd;
        if ( details.separatorBeg < len ) {
            details.separatorEnd += 1;
        }
        details.argEnd -= this.rightWhitespaceCount(pattern.slice(0, details.separatorBeg));
        details.quoteEnd = details.argEnd;
        if ( this.getFlags(AST_FLAG_EXT_SCRIPTLET_ADG) ) {
            details.failed = true;
        }
        return details;
    }

    indexOfNextScriptletArgSeparator(pattern, details) {
        const separatorChar = String.fromCharCode(details.separatorCode);
        while ( details.argEnd < pattern.length ) {
            const pos = pattern.indexOf(separatorChar, details.argEnd);
            if ( pos === -1 ) {
                return (details.argEnd = pattern.length);
            }
            if ( this.reOddTrailingEscape.test(pattern.slice(0, pos)) === false ) {
                return (details.argEnd = pos);
            }
            details.transform = true;
            details.argEnd = pos + 1;
        }
    }

    normalizeScriptletArg(arg, separatorCode) {
        if ( separatorCode === 0x22 /* " */ ) {
            if ( arg.includes('"') === false ) { return; }
            return arg.replace(this.reUnescapeDoubleQuotes, '$1"');
        }
        if ( separatorCode === 0x27 /* ' */ ) {
            if ( arg.includes("'") === false ) { return; }
            return arg.replace(this.reUnescapeSingleQuotes, "$1'");
        }
        if ( arg.includes(',') === false ) { return; }
        return arg.replace(this.reUnescapeCommas, '$1,');
    }

    getScriptletArgs() {
        const args = [];
        if ( this.isScriptletFilter() === false ) { return args; }
        const root = this.getBranchFromType(NODE_TYPE_EXT_PATTERN_SCRIPTLET);
        const walker = this.getWalker(root);
        for ( let node = walker.next(); node !== 0; node = walker.next() ) {
            switch ( this.getNodeType(node) ) {
                case NODE_TYPE_EXT_PATTERN_SCRIPTLET_TOKEN:
                case NODE_TYPE_EXT_PATTERN_SCRIPTLET_ARG:
                    args.push(this.getNodeTransform(node));
                    break;
                default:
                    break;
            }
        }
        walker.dispose();
        return args;
    }

    parseExtPatternResponseheader(parent) {
        const beg = this.nodes[parent+NODE_BEG_INDEX];
        const end = this.nodes[parent+NODE_END_INDEX];
        const s = this.getNodeString(parent);
        const rawArg0 = beg + 16;
        const rawArg1 = end - 1;
        const head = this.allocTypedNode(NODE_TYPE_EXT_DECORATION, beg, rawArg0);
        let prev = head, next = 0;
        const trimmedArg0 = rawArg0 + this.leftWhitespaceCount(s);
        const trimmedArg1 = rawArg1 - this.rightWhitespaceCount(s);
        if ( trimmedArg0 !== rawArg0 ) {
            next = this.allocTypedNode(NODE_TYPE_WHITESPACE, rawArg0, trimmedArg0);
            prev = this.linkRight(prev, next);
        }
        next = this.allocTypedNode(NODE_TYPE_EXT_PATTERN_RESPONSEHEADER, rawArg0, rawArg1);
        this.addNodeToRegister(NODE_TYPE_EXT_PATTERN_RESPONSEHEADER, next);
        if ( rawArg1 === rawArg0 && this.isException() === false ) {
            this.addNodeFlags(parent, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
        }
        prev = this.linkRight(prev, next);
        if ( trimmedArg1 !== rawArg1 ) {
            next = this.allocTypedNode(NODE_TYPE_WHITESPACE, trimmedArg1, rawArg1);
            prev = this.linkRight(prev, next);
        }
        next = this.allocTypedNode(NODE_TYPE_EXT_DECORATION, rawArg1, end);
        this.linkRight(prev, next);
        return head;
    }

    parseExtPatternHtml(parent) {
        const beg = this.nodes[parent+NODE_BEG_INDEX];
        const end = this.nodes[parent+NODE_END_INDEX];
        const head = this.allocTypedNode(NODE_TYPE_EXT_DECORATION, beg, beg + 1);
        let prev = head, next = 0;
        next = this.allocTypedNode(NODE_TYPE_EXT_PATTERN_HTML, beg + 1, end);
        this.linkRight(prev, next);
        if ( (this.hasOptions() || this.isException()) === false ) {
            this.addNodeFlags(parent, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
            return head;
        }
        this.result.exception = this.isException();
        this.result.raw = this.getNodeString(next);
        this.result.compiled = undefined;
        const success = this.selectorCompiler.compile(
            this.result.raw,
            this.result, {
                asProcedural: this.getFlags(AST_FLAG_EXT_STRONG) !== 0
            }
        );
        if ( success !== true ) {
            this.addNodeFlags(next, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
        }
        return head;
    }

    parseExtPatternCosmetic(parent) {
        const parentBeg = this.nodes[parent+NODE_BEG_INDEX];
        const parentEnd = this.nodes[parent+NODE_END_INDEX];
        const head = this.allocTypedNode(
            NODE_TYPE_EXT_PATTERN_COSMETIC,
            parentBeg,
            parentEnd
        );
        this.result.exception = this.isException();
        this.result.raw = this.getNodeString(head);
        this.result.compiled = undefined;
        const success = this.selectorCompiler.compile(
            this.result.raw,
            this.result, {
                asProcedural: this.getFlags(AST_FLAG_EXT_STRONG) !== 0,
                adgStyleSyntax: this.getFlags(AST_FLAG_EXT_STYLE) !== 0,
            }
        );
        if ( success !== true ) {
            this.addNodeFlags(head, NODE_FLAG_ERROR);
            this.addFlags(AST_FLAG_HAS_ERROR);
        }
        return head;
    }

    hasError() {
        return (this.astFlags & AST_FLAG_HAS_ERROR) !== 0;
    }

    isUnsupported() {
        return (this.astFlags & AST_FLAG_UNSUPPORTED) !== 0;
    }

    hasOptions() {
        return (this.astFlags & AST_FLAG_HAS_OPTIONS) !== 0;
    }

    isNegatedOption(type) {
        const node = this.nodeTypeLookupTable[type];
        const flags = this.nodes[node+NODE_FLAGS_INDEX];
        return (flags & NODE_FLAG_IS_NEGATED) !== 0;
    }

    isException() {
        return (this.astFlags & AST_FLAG_IS_EXCEPTION) !== 0;
    }

    isLeftHnAnchored() {
        return (this.astFlags & AST_FLAG_NET_PATTERN_LEFT_HNANCHOR) !== 0;
    }

    isLeftAnchored() {
        return (this.astFlags & AST_FLAG_NET_PATTERN_LEFT_ANCHOR) !== 0;
    }

    isRightAnchored() {
        return (this.astFlags & AST_FLAG_NET_PATTERN_RIGHT_ANCHOR) !== 0;
    }

    linkRight(prev, next) {
        return (this.nodes[prev+NODE_RIGHT_INDEX] = next);
    }

    linkDown(node, down) {
        return (this.nodes[node+NODE_DOWN_INDEX] = down);
    }

    makeChain(nodes) {
        for ( let i = 1; i < nodes.length; i++ ) {
            this.nodes[nodes[i-1]+NODE_RIGHT_INDEX] = nodes[i];
        }
        return nodes[0];
    }

    allocHeadNode() {
        const node = this.nodePoolPtr;
        this.nodePoolPtr += NOOP_NODE_SIZE;
        if ( this.nodePoolPtr > this.nodePoolEnd ) {
            this.growNodePool(this.nodePoolPtr);
        }
        this.nodes[node+NODE_RIGHT_INDEX] = 0;
        return node;
    }

    throwHeadNode(head) {
        return this.nodes[head+NODE_RIGHT_INDEX];
    }

    allocTypedNode(type, beg, end) {
        const node = this.nodePoolPtr;
        this.nodePoolPtr += FULL_NODE_SIZE;
        if ( this.nodePoolPtr > this.nodePoolEnd ) {
            this.growNodePool(this.nodePoolPtr);
        }
        this.nodes[node+NODE_RIGHT_INDEX] = 0;
        this.nodes[node+NODE_TYPE_INDEX] = type;
        this.nodes[node+NODE_DOWN_INDEX] = 0;
        this.nodes[node+NODE_BEG_INDEX] = beg;
        this.nodes[node+NODE_END_INDEX] = end;
        this.nodes[node+NODE_TRANSFORM_INDEX] = 0;
        this.nodes[node+NODE_FLAGS_INDEX] = 0;
        return node;
    }

    allocSentinelNode(type, beg) {
        return this.allocTypedNode(type, beg, beg);
    }

    growNodePool(min) {
        const oldSize = this.nodes.length;
        const newSize = (min + 16383) & ~16383;
        if ( newSize === oldSize ) { return; }
        const newArray = new Uint32Array(newSize);
        newArray.set(this.nodes);
        this.nodes = newArray;
        this.nodePoolEnd = newSize;
    }

    getNodeTypes() {
        return this.nodeTypeRegister.slice(0, this.nodeTypeRegisterPtr);
    }

    getNodeType(node) {
        return node !== 0 ? this.nodes[node+NODE_TYPE_INDEX] : 0;
    }

    getNodeFlags(node, flags = 0xFFFFFFFF) {
        return this.nodes[node+NODE_FLAGS_INDEX] & flags;
    }

    setNodeFlags(node, flags) {
        this.nodes[node+NODE_FLAGS_INDEX] = flags;
    }

    addNodeFlags(node, flags) {
        if ( node === 0 ) { return; }
        this.nodes[node+NODE_FLAGS_INDEX] |= flags;
    }

    removeNodeFlags(node, flags) {
        this.nodes[node+NODE_FLAGS_INDEX] &= ~flags;
    }

    addNodeToRegister(type, node) {
        this.nodeTypeRegister[this.nodeTypeRegisterPtr++] = type;
        this.nodeTypeLookupTable[type] = node;
    }

    getBranchFromType(type) {
        const ptr = this.nodeTypeRegisterPtr;
        if ( ptr === 0 ) { return 0; }
        return this.nodeTypeRegister.lastIndexOf(type, ptr-1) !== -1
            ? this.nodeTypeLookupTable[type]
            : 0;
    }

    nodeIsEmptyString(node) {
        return this.nodes[node+NODE_END_INDEX] ===
            this.nodes[node+NODE_BEG_INDEX];
    }

    getNodeString(node) {
        const beg = this.nodes[node+NODE_BEG_INDEX];
        const end = this.nodes[node+NODE_END_INDEX];
        if ( end === beg ) { return ''; }
        if ( beg === 0 && end === this.rawEnd ) {
            return this.raw;
        }
        return this.raw.slice(beg, end);
    }

    getNodeStringBeg(node) {
        return this.nodes[node+NODE_BEG_INDEX];
    }

    getNodeStringEnd(node) {
        return this.nodes[node+NODE_END_INDEX];
    }

    getNodeStringLen(node) {
        if ( node === 0 ) { return ''; }
        return this.nodes[node+NODE_END_INDEX] - this.nodes[node+NODE_BEG_INDEX];
    }

    isNodeTransformed(node) {
        return this.nodes[node+NODE_TRANSFORM_INDEX] !== 0;
    }

    getNodeTransform(node) {
        if ( node === 0 ) { return ''; }
        const slot = this.nodes[node+NODE_TRANSFORM_INDEX];
        return slot !== 0 ? this.astTransforms[slot] : this.getNodeString(node);
    }

    setNodeTransform(node, value) {
        const slot = this.astTransformPtr++;
        this.astTransforms[slot] = value;
        this.nodes[node+NODE_TRANSFORM_INDEX] = slot;
    }

    getTypeString(type) {
        const node = this.getBranchFromType(type);
        if ( node === 0 ) { return; }
        return this.getNodeString(node);
    }

    leftWhitespaceCount(s) {
        const match = this.reWhitespaceStart.exec(s);
        return match === null ? 0 : match[0].length;
    }

    rightWhitespaceCount(s) {
        const match = this.reWhitespaceEnd.exec(s);
        return match === null ? 0 : match[0].length;
    }

    nextCommaInCommaSeparatedListString(s, start) {
        const n = s.length;
        if ( n === 0 ) { return -1; }
        const ilastchar = n - 1;
        let i = start;
        while ( i < n ) {
            const c = s.charCodeAt(i);
            if ( c === 0x2C /* ',' */ ) { return i + 1; }
            if ( c === 0x5C /* '\\' */ ) {
                if ( i < ilastchar ) { i += 1; }
            }
        }
        return -1;
    }

    endOfLiteralRegex(s, start) {
        const n = s.length;
        if ( n === 0 ) { return -1; }
        const ilastchar = n - 1;
        let i = start + 1;
        while ( i < n ) {
            const c = s.charCodeAt(i);
            if ( c === 0x2F /* '/' */ ) { return i + 1; }
            if ( c === 0x5C /* '\\' */ ) {
                if ( i < ilastchar ) { i += 1; }
            }
            i += 1;
        }
        return -1;
    }

    charCodeAt(pos) {
        return pos < this.rawEnd ? this.raw.charCodeAt(pos) : -1;
    }

    isTokenCharCode(c) {
        return c === 0x25 ||
            c >= 0x30 && c <= 0x39 ||
            c >= 0x41 && c <= 0x5A ||
            c >= 0x61 && c <= 0x7A;
    }

    // Ultimately, let the browser API do the hostname normalization, after
    // making some other trivial checks.
    //
    // mode bits:
    //   0b00001: can use wildcard at any position
    //   0b00010: can use entity-based hostnames
    //   0b00100: can use single wildcard
    //   0b01000: can be negated
    //
    // returns:
    //   undefined: no normalization needed, use original hostname
    //   empty string: hostname is invalid
    //   non-empty string: normalized hostname
    normalizeHostnameValue(s, modeBits = 0b00000) {
        if ( this.reHostnameAscii.test(s) ) { return; }
        if ( this.reBadHostnameChars.test(s) ) { return ''; }
        let hn = s;
        const hasWildcard = hn.includes('*');
        if ( hasWildcard ) {
            if ( modeBits === 0 ) { return ''; }
            if ( hn.length === 1 ) {
                if ( (modeBits & 0b0100) === 0 ) { return ''; }
                return;
            }
            if ( (modeBits & 0b0010) !== 0 ) {
                if ( this.rePlainEntity.test(hn) ) { return; }
                if ( this.reIsEntity.test(hn) === false ) { return ''; }
            } else if ( (modeBits & 0b0001) === 0 ) {
                return '';
            }
            hn = hn.replace(/\*/g, '__asterisk__');
        }
        this.punycoder.hostname = '_';
        try {
            this.punycoder.hostname = hn;
            hn = this.punycoder.hostname;
        } catch (_) {
            return '';
        }
        if ( hn === '_' || hn === '' ) { return ''; }
        if ( hasWildcard ) {
            hn = this.punycoder.hostname.replace(/__asterisk__/g, '*');
        }
        if (
            (modeBits & 0b0001) === 0 && (
                hn.charCodeAt(0) === 0x2E /* . */ ||
                exCharCodeAt(hn, -1) === 0x2E /* . */
            )
        ) {
            return '';
        }
        return hn;
    }

    normalizeRegexPattern(s) {
        try {
            const source = /^\/.+\/$/.test(s) ? s.slice(1,-1) : s;
            const regex = new RegExp(source);
            return regex.source;
        } catch (ex) {
            this.normalizeRegexPattern.message = ex.toString();
        }
        return '';
    }

    getDomainListIterator(root) {
        const iter = this.domainListIteratorJunkyard.length !== 0
            ? this.domainListIteratorJunkyard.pop().reuse(root)
            : new DomainListIterator(this, root);
        return root !== 0 ? iter : iter.stop();
    }

    getNetFilterFromOptionIterator() {
        return this.getDomainListIterator(
            this.getBranchFromType(NODE_TYPE_NET_OPTION_NAME_FROM)
        );
    }

    getNetFilterToOptionIterator() {
        return this.getDomainListIterator(
            this.getBranchFromType(NODE_TYPE_NET_OPTION_NAME_TO)
        );
    }

    getNetFilterDenyallowOptionIterator() {
        return this.getDomainListIterator(
            this.getBranchFromType(NODE_TYPE_NET_OPTION_NAME_DENYALLOW)
        );
    }

    getExtFilterDomainIterator() {
        return this.getDomainListIterator(
            this.getBranchFromType(NODE_TYPE_EXT_OPTIONS)
        );
    }

    getWalker(from) {
        if ( this.walkerJunkyard.length === 0 ) {
            return new AstWalker(this, from);
        }
        const walker = this.walkerJunkyard.pop();
        walker.reset(from);
        return walker;
    }

    findDescendantByType(from, type) {
        const walker = this.getWalker(from);
        let node = walker.next();
        while ( node !== 0 ) {
            if ( this.getNodeType(node) === type ) { return node; }
            node = walker.next();
        }
        return 0;
    }

    dump() {
        if ( this.astType === AST_TYPE_COMMENT ) { return; }
        const walker = this.getWalker();
        for ( let node = walker.reset(); node !== 0; node = walker.next() ) {
            const type = this.nodes[node+NODE_TYPE_INDEX];
            const value = this.getNodeString(node);
            const name = nodeNameFromNodeType.get(type) || `${type}`;
            const bits = this.getNodeFlags(node).toString(2).padStart(4, '0');
            const indent = '  '.repeat(walker.depth);
            console.log(`${indent}type=${name} "${value}" 0b${bits}`);
            if ( this.isNodeTransformed(node) ) {
                console.log(`${indent}    transform="${this.getNodeTransform(node)}`);
            }
        }
    }
}

/******************************************************************************/

export function parseRedirectValue(arg) {
    let token = arg.trim();
    let priority = 0;
    const asDataURI = token.charCodeAt(0) === 0x25 /* '%' */;
    if ( asDataURI ) { token = token.slice(1); }
    const match = /:-?\d+$/.exec(token);
    if ( match !== null ) {
        priority = parseInt(token.slice(match.index + 1), 10);
        token = token.slice(0, match.index);
    }
    return { token, priority, asDataURI };
}

export function parseQueryPruneValue(arg) {
    let s = arg.trim();
    if ( s === '' ) { return { all: true }; }
    const out = { };
    out.not = s.charCodeAt(0) === 0x7E /* '~' */;
    if ( out.not ) {
        s = s.slice(1);
    }
    const match = /^\/(.+)\/(i)?$/.exec(s);
    if ( match !== null ) {
        try {
            out.re = new RegExp(match[1], match[2] || '');
        }
        catch(ex) {
            out.bad = true;
        }
        return out;
    }
    // TODO: remove once no longer used in filter lists
    if ( s.startsWith('|') ) {
        try {
            out.re = new RegExp('^' + s.slice(1), 'i');
        } catch(ex) {
            out.bad = true;
        }
        return out;
    }
    // Multiple values not supported (because very inefficient)
    if ( s.includes('|') ) {
        out.bad = true;
        return out;
    }
    out.name = s;
    return out;
}

export function parseHeaderValue(arg) {
    let s = arg.trim();
    const out = { };
    let pos = s.indexOf(':');
    if ( pos === -1 ) { pos = s.length; }
    out.name = s.slice(0, pos);
    out.bad = out.name === '';
    s = s.slice(pos + 1);
    out.not = s.charCodeAt(0) === 0x7E /* '~' */;
    if ( out.not ) { s = s.slice(1); }
    out.value = s;
    const match = /^\/(.+)\/(i)?$/.exec(s);
    if ( match !== null ) {
        try {
            out.re = new RegExp(match[1], match[2] || '');
        }
        catch(ex) {
            out.bad = true;
        }
    }
    return out;
}

/******************************************************************************/

export const netOptionTokenDescriptors = new Map([
    [ '1p', { canNegate: true } ],
    /* synonym */ [ 'first-party', { canNegate: true } ],
    [ 'strict1p', { } ],
    [ '3p', { canNegate: true } ],
    /* synonym */ [ 'third-party', { canNegate: true } ],
    [ 'strict3p', { } ],
    [ 'all', { } ],
    [ 'badfilter', { } ],
    [ 'cname', { allowOnly: true } ],
    [ 'csp', { mustAssign: true } ],
    [ 'css', { canNegate: true } ],
    /* synonym */ [ 'stylesheet', { canNegate: true } ],
    [ 'denyallow', { mustAssign: true } ],
    [ 'doc', { canNegate: true } ],
    /* synonym */ [ 'document', { canNegate: true } ],
    [ 'ehide', { } ],
    /* synonym */ [ 'elemhide', { } ],
    [ 'empty', { blockOnly: true } ],
    [ 'frame', { canNegate: true } ],
    /* synonym */ [ 'subdocument', { canNegate: true } ],
    [ 'from', { mustAssign: true } ],
    /* synonym */ [ 'domain', { mustAssign: true } ],
    [ 'font', { canNegate: true } ],
    [ 'genericblock', { } ],
    [ 'ghide', { } ],
    /* synonym */ [ 'generichide', { } ],
    [ 'header', { mustAssign: true } ],
    [ 'image', { canNegate: true } ],
    [ 'important', { blockOnly: true } ],
    [ 'inline-font', { canNegate: true } ],
    [ 'inline-script', { canNegate: true } ],
    [ 'match-case', { } ],
    [ 'media', { canNegate: true } ],
    [ 'method', { mustAssign: true } ],
    [ 'mp4', { blockOnly: true } ],
    [ '_', { } ],
    [ 'object', { canNegate: true } ],
    /* synonym */ [ 'object-subrequest', { canNegate: true } ],
    [ 'other', { canNegate: true } ],
    [ 'ping', { canNegate: true } ],
    /* synonym */ [ 'beacon', { canNegate: true } ],
    [ 'popunder', { } ],
    [ 'popup', { canNegate: true } ],
    [ 'redirect', { mustAssign: true } ],
    /* synonym */ [ 'rewrite', { mustAssign: true } ],
    [ 'redirect-rule', { mustAssign: true } ],
    [ 'removeparam', { } ],
    /* synonym */ [ 'queryprune', { } ],
    [ 'script', { canNegate: true } ],
    [ 'shide', { } ],
    /* synonym */ [ 'specifichide', { } ],
    [ 'to', { mustAssign: true } ],
    [ 'xhr', { canNegate: true } ],
    /* synonym */ [ 'xmlhttprequest', { canNegate: true } ],
    [ 'webrtc', { } ],
    [ 'websocket', { canNegate: true } ],
]);

/******************************************************************************/

// https://github.com/chrisaljoudi/uBlock/issues/1004
//   Detect and report invalid CSS selectors.

// Discard new ABP's `-abp-properties` directive until it is
// implemented (if ever). Unlikely, see:
// https://github.com/gorhill/uBlock/issues/1752

// https://github.com/gorhill/uBlock/issues/2624
//   Convert Adguard's `-ext-has='...'` into uBO's `:has(...)`.

// https://github.com/uBlockOrigin/uBlock-issues/issues/89
//   Do not discard unknown pseudo-elements.

class ExtSelectorCompiler {
    constructor(instanceOptions) {
        this.reParseRegexLiteral = /^\/(.+)\/([imu]+)?$/;

        // Use a regex for most common CSS selectors known to be valid in any
        // context.
        const cssIdentifier = '[A-Za-z_][\\w-]*';
        const cssClassOrId = `[.#]${cssIdentifier}`;
        const cssAttribute = `\\[${cssIdentifier}(?:[*^$]?="[^"\\]\\\\]+")?\\]`;
        const cssSimple =
            '(?:' +
            `${cssIdentifier}(?:${cssClassOrId})*(?:${cssAttribute})*` + '|' +
            `${cssClassOrId}(?:${cssClassOrId})*(?:${cssAttribute})*` + '|' +
            `${cssAttribute}(?:${cssAttribute})*` +
            ')';
        const cssCombinator = '(?: | [+>~] )';
        this.reCommonSelector = new RegExp(
            `^${cssSimple}(?:${cssCombinator}${cssSimple})*$`
        );
        // Resulting regex literal:
        // /^(?:[A-Za-z_][\w-]*(?:[.#][A-Za-z_][\w-]*)*(?:\[[A-Za-z_][\w-]*(?:[*^$]?="[^"\]\\]+")?\])*|[.#][A-Za-z_][\w-]*(?:[.#][A-Za-z_][\w-]*)*(?:\[[A-Za-z_][\w-]*(?:[*^$]?="[^"\]\\]+")?\])*|\[[A-Za-z_][\w-]*(?:[*^$]?="[^"\]\\]+")?\](?:\[[A-Za-z_][\w-]*(?:[*^$]?="[^"\]\\]+")?\])*)(?:(?:\s+|\s*[>+~]\s*)(?:[A-Za-z_][\w-]*(?:[.#][A-Za-z_][\w-]*)*(?:\[[A-Za-z_][\w-]*(?:[*^$]?="[^"\]\\]+")?\])*|[.#][A-Za-z_][\w-]*(?:[.#][A-Za-z_][\w-]*)*(?:\[[A-Za-z_][\w-]*(?:[*^$]?="[^"\]\\]+")?\])*|\[[A-Za-z_][\w-]*(?:[*^$]?="[^"\]\\]+")?\](?:\[[A-Za-z_][\w-]*(?:[*^$]?="[^"\]\\]+")?\])*))*$/

        this.reEatBackslashes = /\\([()])/g;
        this.reEscapeRegex = /[.*+?^${}()|[\]\\]/g;
        // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes
        this.knownPseudoClasses = new Set([
            'active', 'any-link', 'autofill',
            'blank',
            'checked', 'current',
            'default', 'defined', 'dir', 'disabled',
            'empty', 'enabled',
            'first', 'first-child', 'first-of-type', 'fullscreen', 'future', 'focus', 'focus-visible', 'focus-within',
            'has', 'host', 'host-context', 'hover',
            'indeterminate', 'in-range', 'invalid', 'is',
            'lang', 'last-child', 'last-of-type', 'left', 'link', 'local-link',
            'modal',
            'not', 'nth-child', 'nth-col', 'nth-last-child', 'nth-last-col', 'nth-last-of-type', 'nth-of-type',
            'only-child', 'only-of-type', 'optional', 'out-of-range',
            'past', 'picture-in-picture', 'placeholder-shown', 'paused', 'playing',
            'read-only', 'read-write', 'required', 'right', 'root',
            'scope', 'state', 'target', 'target-within',
            'user-invalid', 'valid', 'visited',
            'where',
        ]);
        this.knownPseudoClassesWithArgs = new Set([
            'dir',
            'has', 'host-context',
            'is',
            'lang',
            'not', 'nth-child', 'nth-col', 'nth-last-child', 'nth-last-col', 'nth-last-of-type', 'nth-of-type',
            'state',
            'where',
        ]);
        // https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-elements
        this.knownPseudoElements = new Set([
            'after',
            'backdrop', 'before',
            'cue', 'cue-region',
            'first-letter', 'first-line', 'file-selector-button',
            'grammar-error', 'marker',
            'part', 'placeholder',
            'selection', 'slotted', 'spelling-error',
            'target-text',
        ]);
        this.knownPseudoElementsWithArgs = new Set([
            'part',
            'slotted',
        ]);
        // https://github.com/gorhill/uBlock/issues/2793
        this.normalizedOperators = new Map([
            [ '-abp-has', 'has' ],
            [ '-abp-contains', 'has-text' ],
            [ 'contains', 'has-text' ],
            [ 'nth-ancestor', 'upward' ],
            [ 'watch-attrs', 'watch-attr' ],
        ]);
        this.actionOperators = new Set([
            ':remove',
            ':style',
        ]);
        this.proceduralOperatorNames = new Set([
            'has-text',
            'if',
            'if-not',
            'matches-attr',
            'matches-css',
            'matches-css-after',
            'matches-css-before',
            'matches-media',
            'matches-path',
            'min-text-length',
            'others',
            'upward',
            'watch-attr',
            'xpath',
        ]);
        this.maybeProceduralOperatorNames = new Set([
            'has',
            'not',
        ]);
        this.proceduralActionNames = new Set([
            'remove',
            'remove-attr',
            'remove-class',
            'style',
        ]);
        this.normalizedExtendedSyntaxOperators = new Map([
            [ 'contains', 'has-text' ],
            [ 'has', 'has' ],
        ]);
        this.reIsRelativeSelector = /^\s*[+>~]/;
        this.reExtendedSyntax = /\[-(?:abp|ext)-[a-z-]+=(['"])(?:.+?)(?:\1)\]/;
        this.reExtendedSyntaxReplacer = /\[-(?:abp|ext)-([a-z-]+)=(['"])(.+?)\2\]/g;
        this.abpProceduralOpReplacer = /:-abp-(?:[a-z]+)\(/g;
        this.nativeCssHas = instanceOptions.nativeCssHas === true;
        // https://www.w3.org/TR/css-syntax-3/#typedef-ident-token
        this.reInvalidIdentifier = /^\d/;
        this.error = undefined;
    }

    compile(raw, out, compileOptions = {}) {
        this.asProcedural = compileOptions.asProcedural === true;

        // https://github.com/gorhill/uBlock/issues/952
        //   Find out whether we are dealing with an Adguard-specific cosmetic
        //   filter, and if so, translate it if supported, or discard it if not
        //   supported.
        //   We have an Adguard/ABP cosmetic filter if and only if the
        //   character is `$`, `%` or `?`, otherwise it's not a cosmetic
        //   filter.
        // Adguard's style injection: translate to uBO's format.
        if ( compileOptions.adgStyleSyntax === true ) {
            raw = this.translateAdguardCSSInjectionFilter(raw);
            if ( raw === '' ) { return false; }
        }

        // Normalize AdGuard's attribute-based procedural operators.
        // Normalize ABP's procedural operator names
        if ( this.asProcedural ) {
            if ( this.reExtendedSyntax.test(raw) ) {
                raw = raw.replace(this.reExtendedSyntaxReplacer, (a, a1, a2, a3) => {
                    const op = this.normalizedExtendedSyntaxOperators.get(a1);
                    if ( op === undefined ) { return a; }
                    return `:${op}(${a3})`;
                });
            } else {
                let asProcedural = false;
                raw = raw.replace(this.abpProceduralOpReplacer, match => {
                    if ( match === ':-abp-contains(' ) { return ':has-text('; } 
                    if ( match === ':-abp-has(' ) { return ':has('; }
                    asProcedural = true;
                    return match;
                });
                this.asProcedural = asProcedural;
            }
        }

        // Relative selectors not allowed at top level.
        if ( this.reIsRelativeSelector.test(raw) ) { return false; }

        if ( this.reCommonSelector.test(raw) ) {
            out.compiled = raw;
            return true;
        }

        this.error = undefined;
        out.compiled = this.compileSelector(raw);
        if ( out.compiled === undefined ) {
            out.error = this.error;
            return false;
        }

        if ( out.compiled instanceof Object ) {
            out.compiled.raw = raw;
            out.compiled = JSON.stringify(out.compiled);
        }
        return true;
    }

    compileSelector(raw) {
        const parts = this.astFromRaw(raw, 'selectorList');
        if ( parts === undefined ) { return; }
        if ( this.astHasType(parts, 'Error') ) { return; }
        if ( this.astHasType(parts, 'Selector') === false ) { return; }
        if ( this.astIsValidSelectorList(parts) === false ) { return; }
        if (
            this.astHasType(parts, 'ProceduralSelector') === false &&
            this.astHasType(parts, 'ActionSelector') === false
        ) {
            return this.astSerialize(parts);
        }
        const r = this.astCompile(parts);
        if ( this.isCssable(r) ) {
            r.cssable = true;
        }
        return r;
    }

    isCssable(r) {
        if ( r instanceof Object === false ) { return false; }
        if ( Array.isArray(r.action) && r.action[0] !== 'style' ) { return false; }
        if ( Array.isArray(r.tasks) === false ) { return true; }
        if ( r.tasks[0][0] === 'matches-media' ) {
            if ( r.tasks.length === 1 ) { return true; }
            if ( r.tasks.length === 2 ) {
                if ( r.selector !== '' ) { return false; }
                if ( r.tasks[1][0] === 'spath' ) { return true; }
            }
        }
        return false;
    }

    astFromRaw(raw, type) {
        let ast;
        try {
            ast = cssTree.parse(raw, {
                context: type,
                parseValue: false,
            });
        } catch(reason) {
            const lines = [ reason.message ];
            const extra = reason.sourceFragment().split('\n');
            if ( extra.length !== 0 ) { lines.push(''); }
            const match = /^[^|]+\|/.exec(extra[0]);
            const beg = match !== null ? match[0].length : 0;
            lines.push(...extra.map(a => a.slice(beg)));
            this.error = lines.join('\n');
            return;
        }
        const parts = [];
        this.astFlatten(ast, parts);
        return parts;
    }

    astFlatten(data, out) {
        const head = data.children && data.children.head;
        let args;
        switch ( data.type ) {
        case 'AttributeSelector':
        case 'ClassSelector':
        case 'Combinator':
        case 'IdSelector':
        case 'MediaFeature':
        case 'Nth':
        case 'Raw':
        case 'TypeSelector':
            out.push({ data });
            break;
        case 'Declaration':
            if ( data.value ) {
                this.astFlatten(data.value, args = []);
            }
            out.push({ data, args });
            args = undefined;
            break;
        case 'DeclarationList':
        case 'Identifier':
        case 'MediaQueryList':
        case 'Selector':
        case 'SelectorList':
            args = out;
            out.push({ data });
            break;
        case 'MediaQuery':
        case 'PseudoClassSelector':
        case 'PseudoElementSelector':
            if ( head ) { args = []; }
            out.push({ data, args });
            break;
        case 'Value':
            args = out;
            break;
        default:
            break;
        }
        if ( head ) {
            if ( args ) {
                this.astFlatten(head.data, args);
            }
            let next = head.next;
            while ( next ) {
                this.astFlatten(next.data, args);
                next = next.next;
            }
        }
        if ( data.type !== 'PseudoClassSelector' ) { return; }
        if ( data.name.startsWith('-abp-') && this.asProcedural === false ) {
            this.error = `${data.name} requires '#?#' separator syntax`;
            return;
        }
        // Post-analysis, mind:
        // - https://w3c.github.io/csswg-drafts/selectors-4/#has-pseudo
        // - https://w3c.github.io/csswg-drafts/selectors-4/#negation
        data.name = this.normalizedOperators.get(data.name) || data.name;
        if ( this.proceduralOperatorNames.has(data.name) ) {
            data.type = 'ProceduralSelector';
        } else if ( this.proceduralActionNames.has(data.name) ) {
            data.type = 'ActionSelector';
        } else if ( data.name.startsWith('-abp-') ) {
            data.type = 'Error';
            this.error = `${data.name} is not supported`;
            return;
        }
        if ( this.maybeProceduralOperatorNames.has(data.name) === false ) {
            return;
        }
        if ( this.astHasType(args, 'ActionSelector') ) {
            data.type = 'Error';
            this.error = 'invalid use of action operator';
            return;
        }
        if ( this.astHasType(args, 'ProceduralSelector') ) {
            data.type = 'ProceduralSelector';
            return;
        }
        switch ( data.name ) {
        case 'has':
            if (
                this.asProcedural ||
                this.nativeCssHas !== true ||
                this.astHasName(args, 'has')
            ) {
                data.type = 'ProceduralSelector';
            } else if ( this.astHasType(args, 'PseudoElementSelector') ) {
                data.type = 'Error';
            }
            break;
        case 'not': {
            if ( this.astHasType(args, 'Combinator', 0) === false ) { break; }
            if ( this.astIsValidSelectorList(args) !== true ) {
                data.type = 'Error';
            }
            break;
        }
        default:
            break;
        }
    }

    // https://github.com/uBlockOrigin/uBlock-issues/issues/2300
    //   Unquoted attribute values are parsed as Identifier instead of String.
    astSerializePart(part) {
        const out = [];
        const { data } = part;
        switch ( data.type ) {
        case 'AttributeSelector': {
            const name = data.name.name;
            if ( this.reInvalidIdentifier.test(name) ) { return; }
            if ( data.matcher === null ) {
                out.push(`[${name}]`);
                break;
            }
            let value = data.value.value;
            if ( typeof value !== 'string' ) {
                value = data.value.name;
            }
            value = value.replace(/["\\]/g, '\\$&');
            let flags = '';
            if ( typeof data.flags === 'string' ) {
                if ( /^(is?|si?)$/.test(data.flags) === false ) { return; }
                flags = ` ${data.flags}`;
            }
            out.push(`[${name}${data.matcher}"${value}"${flags}]`);
            break;
        }
        case 'ClassSelector':
            if ( this.reInvalidIdentifier.test(data.name) ) { return; }
            out.push(`.${data.name}`);
            break;
        case 'Combinator':
            out.push(data.name);
            break;
        case 'Identifier':
            if ( this.reInvalidIdentifier.test(data.name) ) { return; }
            out.push(data.name);
            break;
        case 'IdSelector':
            if ( this.reInvalidIdentifier.test(data.name) ) { return; }
            out.push(`#${data.name}`);
            break;
        case 'Nth': {
            if ( data.selector !== null ) { return; }
            if ( data.nth.type === 'AnPlusB' ) {
                const a = parseInt(data.nth.a, 10) || null;
                const b = parseInt(data.nth.b, 10) || null;
                if ( a !== null ) {
                    out.push(`${a}n`);
                    if ( b === null ) { break; }
                    if ( b < 0 ) {
                        out.push(`${b}`);
                    } else {
                        out.push(`+${b}`);
                    }
                } else if ( b !== null ) {
                    out.push(`${b}`);
                }
            } else if ( data.nth.type === 'Identifier' ) {
                out.push(data.nth.name);
            }
            break;
        }
        case 'PseudoElementSelector': {
            const hasArgs = Array.isArray(part.args);
            if ( data.name.charCodeAt(0) !== 0x2D /* '-' */ ) {
                if ( this.knownPseudoElements.has(data.name) === false ) { return; }
                if ( this.knownPseudoElementsWithArgs.has(data.name) && hasArgs === false ) { return; }
            }
            out.push(`::${data.name}`);
            if ( hasArgs ) {
                const arg = this.astSerialize(part.args);
                if ( typeof arg !== 'string' ) { return; }
                out.push(`(${arg})`);
            }
            break;
        }
        case 'PseudoClassSelector': {
            const hasArgs = Array.isArray(part.args);
            if ( data.name.charCodeAt(0) !== 0x2D /* '-' */ ) {
                if ( this.knownPseudoClasses.has(data.name) === false ) { return; }
                if ( this.knownPseudoClassesWithArgs.has(data.name) && hasArgs === false ) { return; }
            }
            out.push(`:${data.name}`);
            if ( hasArgs ) {
                const arg = this.astSerialize(part.args);
                if ( typeof arg !== 'string' ) { return; }
                out.push(`(${arg.trim()})`);
            }
            break;
        }
        case 'Raw':
            out.push(data.value);
            break;
        case 'TypeSelector':
            if ( this.reInvalidIdentifier.test(data.name) ) { return; }
            out.push(data.name);
            break;
        default:
            break;
        }
        return out.join('');
    }

    astAppendPart(part, out) {
        const s = this.astSerializePart(part);
        if ( s === undefined ) { return false; }
        const { data } = part;
        switch ( data.type ) {
            case 'Combinator':
                if ( out.length === 0 ) {
                    if ( s !== ' ' ) {
                        out.push(s, ' ');
                    }
                } else {
                    out.push(' ');
                    if ( s !== ' ' ) {
                        out.push(s, ' ');
                    }
                }
                break;
            // csstree parses `.promoted*` as valid
            case 'TypeSelector':
                if ( s === '*' && out.length !== 0 ) {
                    const before = out[out.length-1];
                    if ( before.endsWith(' ') === false ) { return false; }
                }
                out.push(s);
                break;
        }
        return true;
    }

    astSerialize(parts, plainCSS = true) {
        const out = [];
        for ( const part of parts ) {
            const { data } = part;
            switch ( data.type ) {
            case 'AttributeSelector':
            case 'ClassSelector':
            case 'Identifier':
            case 'IdSelector':
            case 'Nth':
            case 'PseudoClassSelector':
            case 'PseudoElementSelector': {
                const s = this.astSerializePart(part);
                if ( s === undefined ) { return; }
                out.push(s);
                break;
            }
            case 'Combinator':
            case 'TypeSelector':
                if ( this.astAppendPart(part, out) === false ) { return; }
                break;
            case 'Raw':
                if ( plainCSS ) { return; }
                out.push(this.astSerializePart(part));
                break;
            case 'Selector':
                if ( out.length !== 0 ) { out.push(', '); }
                break;
            case 'SelectorList':
                break;
            default:
                return;
            }
        }
        return out.join('');
    }

    astCompile(parts, details = {}) {
        if ( Array.isArray(parts) === false ) { return; }
        if ( parts.length === 0 ) { return; }
        if ( parts[0].data.type !== 'SelectorList' ) { return; }
        const out = { selector: '' };
        const prelude = [];
        const tasks = [];
        for ( const part of parts ) {
            if ( out.action !== undefined ) { return; }
            const { data } = part;
            switch ( data.type ) {
            case 'ActionSelector': {
                if ( details.noaction ) { return; }
                if ( prelude.length !== 0 ) {
                    if ( tasks.length === 0 ) {
                        out.selector = prelude.join('');
                    } else {
                        tasks.push(this.createSpathTask(prelude.join('')));
                    }
                    prelude.length = 0;
                }
                const args = this.compileArgumentAst(data.name, part.args);
                if ( args === undefined ) { return; }
                out.action = [ data.name, args ];
                break;
            }
            case 'AttributeSelector':
            case 'ClassSelector':
            case 'IdSelector':
            case 'PseudoClassSelector':
            case 'PseudoElementSelector':
            case 'TypeSelector': {
                const component = this.astSerializePart(part);
                if ( component === undefined ) { return; }
                prelude.push(component);
                break;
            }
            case 'Combinator': {
                if ( this.astAppendPart(part, prelude) === false ) { return; }
                break;
            }
            case 'ProceduralSelector': {
                if ( prelude.length !== 0 ) {
                    let spath = prelude.join('');
                    prelude.length = 0;
                    if ( spath.endsWith(' ') ) { spath += '*'; }
                    if ( tasks.length === 0 ) {
                        out.selector = spath;
                    } else {
                        tasks.push(this.createSpathTask(spath));
                    }
                }
                const args = this.compileArgumentAst(data.name, part.args);
                if ( args === undefined ) { return; }
                tasks.push([ data.name, args ]);
                break;
            }
            case 'Selector':
                if ( prelude.length !== 0 ) {
                    prelude.push(', ');
                }
                break;
            case 'SelectorList':
                break;
            default:
                return;
            }
        }
        if ( tasks.length === 0 && out.action === undefined ) {
            if ( prelude.length === 0 ) { return; }
            return prelude.join('').trim();
        }
        if ( prelude.length !== 0 ) {
            tasks.push(this.createSpathTask(prelude.join('')));
        }
        if ( tasks.length !== 0 ) {
            out.tasks = tasks;
        }
        return out;
    }

    astHasType(parts, type, depth = 0x7FFFFFFF) {
        if ( Array.isArray(parts) === false ) { return false; }
        for ( const part of parts ) {
            if ( part.data.type === type ) { return true; }
            if (
                Array.isArray(part.args) &&
                depth !== 0 &&
                this.astHasType(part.args, type, depth-1)
            ) {
                return true;
            }
        }
        return false;
    }

    astHasName(parts, name) {
        if ( Array.isArray(parts) === false ) { return false; }
        for ( const part of parts ) {
            if ( part.data.name === name ) { return true; }
            if ( Array.isArray(part.args) && this.astHasName(part.args, name) ) {
                return true;
            }
        }
        return false;
    }

    astSelectorsFromSelectorList(args) {
        if ( Array.isArray(args) === false ) { return; }
        if ( args.length < 3 ) { return; }
        if ( args[0].data instanceof Object === false ) { return; }
        if ( args[0].data.type !== 'SelectorList' ) { return; }
        if ( args[1].data instanceof Object === false ) { return; }
        if ( args[1].data.type !== 'Selector' ) { return; }
        const out = [];
        let beg = 1, end = 0, i = 2;
        for (;;) {
            if ( i < args.length ) {
                const type = args[i].data instanceof Object && args[i].data.type;
                if ( type === 'Selector' ) {
                    end = i;
                }
            } else {
                end = args.length;
            }
            if ( end !== 0 ) {
                const components = args.slice(beg+1, end);
                if ( components.length === 0 ) { return; }
                out.push(components);
                if ( end === args.length ) { break; }
                beg = end; end = 0;
            }
            if ( i === args.length ) { break; }
            i += 1;
        }
        return out;
    }

    astIsValidSelector(components) {
        const len = components.length;
        if ( len === 0 ) { return false; }
        if ( components[0].data.type === 'Combinator' ) { return false; }
        if ( len === 1 ) { return true; }
        if ( components[len-1].data.type === 'Combinator' ) { return false; }
        return true;
    }

    astIsValidSelectorList(args) {
        const selectors = this.astSelectorsFromSelectorList(args);
        if ( Array.isArray(selectors) === false || selectors.length === 0 ) {
            return false;
        }
        for ( const selector of selectors ) {
            if ( this.astIsValidSelector(selector) !== true ) { return false; }
        }
        return true;
    }

    translateAdguardCSSInjectionFilter(suffix) {
        const matches = /^(.*)\s*\{([^}]+)\}\s*$/.exec(suffix);
        if ( matches === null ) { return ''; }
        const selector = matches[1].trim();
        const style = matches[2].trim();
        // Special style directive `remove: true` is converted into a
        // `:remove()` operator.
        if ( /^\s*remove:\s*true[; ]*$/.test(style) ) {
            return `${selector}:remove()`;
        }
        // For some reasons, many of Adguard's plain cosmetic filters are
        // "disguised" as style-based cosmetic filters: convert such filters
        // to plain cosmetic filters.
        return /display\s*:\s*none\s*!important;?$/.test(style)
            ? selector
            : `${selector}:style(${style})`;
    }

    createSpathTask(selector) {
        return [ 'spath', selector ];
    }

    compileArgumentAst(operator, parts) {
        switch ( operator ) {
        case 'has': {
            let r = this.astCompile(parts, { noaction: true });
            if ( typeof r === 'string' ) {
                r = { selector: r.replace(/^\s*:scope\s*/, ' ') };
            }
            return r;
        }
        case 'not': {
            return this.astCompile(parts, { noaction: true });
        }
        default:
            break;
        }
        if ( Array.isArray(parts) === false || parts.length === 0 ) { return; }
        const arg = this.astSerialize(parts, false);
        if ( arg === undefined ) { return; }
        switch ( operator ) {
        case 'has-text':
            return this.compileText(arg);
        case 'if':
            return this.compileSelector(arg);
        case 'if-not':
            return this.compileSelector(arg);
        case 'matches-attr':
            return this.compileMatchAttrArgument(arg);
        case 'matches-css':
            return this.compileCSSDeclaration(arg);
        case 'matches-css-after':
            return this.compileCSSDeclaration(`after, ${arg}`);
        case 'matches-css-before':
            return this.compileCSSDeclaration(`before, ${arg}`);
        case 'matches-media':
            return this.compileMediaQuery(arg);
        case 'matches-path':
            return this.compileText(arg);
        case 'min-text-length':
            return this.compileInteger(arg);
        case 'others':
            return this.compileNoArgument(arg);
        case 'remove':
            return this.compileNoArgument(arg);
        case 'remove-attr':
            return this.compileText(arg);
        case 'remove-class':
            return this.compileText(arg);
        case 'style':
            return this.compileStyleProperties(arg);
        case 'upward':
            return this.compileUpwardArgument(arg);
        case 'watch-attr':
            return this.compileAttrList(arg);
        case 'xpath':
            return this.compileXpathExpression(arg);
        default:
            break;
        }
    }

    isBadRegex(s) {
        try {
            void new RegExp(s);
        } catch (ex) {
            this.isBadRegex.message = ex.toString();
            return true;
        }
        return false;
    }

    unquoteString(s) {
        const end = s.length;
        if ( end === 0 ) {
            return { s: '', end };
        }
        if ( /^['"]/.test(s) === false ) {
            return { s, i: end };
        }
        const quote = s.charCodeAt(0);
        const out = [];
        let i = 1, c = 0;
        for (;;) {
            c = s.charCodeAt(i);
            if ( c === quote ) {
                i += 1;
                break;
            }
            if ( c === 0x5C /* '\\' */ ) {
                i += 1;
                if ( i === end ) { break; }
                c = s.charCodeAt(i);
                if ( c !== 0x5C && c !== quote ) {
                    out.push(0x5C);
                }
            }
            out.push(c);
            i += 1;
            if ( i === end ) { break; }
        }
        return { s: String.fromCharCode(...out), i };
    }

    compileMatchAttrArgument(s) {
        if ( s === '' ) { return; }
        let attr = '', value = '';
        let r = this.unquoteString(s);
        if ( r.i === s.length ) {
            const pos = r.s.indexOf('=');
            if ( pos === -1 ) {
                attr = r.s;
            } else {
                attr = r.s.slice(0, pos);
                value = r.s.slice(pos+1);
            }
        } else {
            attr = r.s;
            if ( s.charCodeAt(r.i) !== 0x3D ) { return; }
            value = s.slice(r.i+1);
        }
        if ( attr === '' ) { return; }
        if ( value.length !== 0 ) {
            r = this.unquoteString(value);
            if ( r.i !== value.length ) { return; }
            value = r.s;
        }
        return { attr, value };
    }

    // Remove potentially present quotes before processing.
    compileText(s) {
        if ( s === '' ) {
            this.error = 'argument missing';
            return;
        }
        const r = this.unquoteString(s);
        if ( r.i !== s.length ) { return; }
        return r.s;
    }

    compileCSSDeclaration(s) {
        let pseudo; {
            const match = /^[a-z-]+,/.exec(s);
            if ( match !== null ) {
                pseudo = match[0].slice(0, -1);
                s = s.slice(match[0].length).trim();
            }
        }
        const pos = s.indexOf(':');
        if ( pos === -1 ) { return; }
        const name = s.slice(0, pos).trim();
        const value = s.slice(pos + 1).trim();
        const match = this.reParseRegexLiteral.exec(value);
        let regexDetails;
        if ( match !== null ) {
            regexDetails = match[1];
            if ( this.isBadRegex(regexDetails) ) { return; }
            if ( match[2] ) {
                regexDetails = [ regexDetails, match[2] ];
            }
        } else {
            regexDetails = '^' + value.replace(this.reEscapeRegex, '\\$&') + '$';
        }
        return { name, pseudo, value: regexDetails };
    }

    compileInteger(s, min = 0, max = 0x7FFFFFFF) {
        if ( /^\d+$/.test(s) === false ) { return; }
        const n = parseInt(s, 10);
        if ( n < min || n >= max ) { return; }
        return n;
    }

    compileMediaQuery(s) {
        const parts = this.astFromRaw(s, 'mediaQueryList');
        if ( parts === undefined ) { return; }
        if ( this.astHasType(parts, 'Raw') ) { return; }
        if ( this.astHasType(parts, 'MediaQuery') === false ) { return; }
        // TODO: normalize by serializing resulting AST
        return s;
    }

    compileUpwardArgument(s) {
        const i = this.compileInteger(s, 1, 256);
        if ( i !== undefined ) { return i; }
        const parts = this.astFromRaw(s, 'selectorList' );
        if ( this.astIsValidSelectorList(parts) !== true ) { return; }
        if ( this.astHasType(parts, 'ProceduralSelector') ) { return; }
        if ( this.astHasType(parts, 'ActionSelector') ) { return; }
        if ( this.astHasType(parts, 'Error') ) { return; }
        return s;
    }

    compileNoArgument(s) {
        if ( s === '' ) { return s; }
    }

    // https://github.com/uBlockOrigin/uBlock-issues/issues/668
    // https://github.com/uBlockOrigin/uBlock-issues/issues/1693
    // https://github.com/uBlockOrigin/uBlock-issues/issues/1811
    //   Forbid instances of:
    //   - `image-set(`
    //   - `url(`
    //   - any instance of `//`
    //   - backslashes `\`
    //   - opening comment `/*`
    compileStyleProperties(s) {
        if ( /image-set\(|url\(|\/\s*\/|\\|\/\*/i.test(s) ) { return; }
        const parts = this.astFromRaw(s, 'declarationList');
        if ( parts === undefined ) { return; }
        if ( this.astHasType(parts, 'Declaration') === false ) { return; }
        return s;
    }

    compileAttrList(s) {
        if ( s === '' ) { return s; }
        const attrs = s.split('\s*,\s*');
        const out = [];
        for ( const attr of attrs ) {
            if ( attr !== '' ) {
                out.push(attr);
            }
        }
        return out;
    }

    compileXpathExpression(s) {
        const r = this.unquoteString(s);
        if ( r.i !== s.length ) { return; }
        try {
            globalThis.document.createExpression(r.s, null);
        } catch (e) {
            return;
        }
        return r.s;
    }
}

// bit 0: can be used as auto-completion hint
// bit 1: can not be used in HTML filtering
//
export const proceduralOperatorTokens = new Map([
    [ '-abp-contains', 0b00 ],
    [ '-abp-has', 0b00, ],
    [ 'contains', 0b00, ],
    [ 'has', 0b01 ],
    [ 'has-text', 0b01 ],
    [ 'if', 0b00 ],
    [ 'if-not', 0b00 ],
    [ 'matches-attr', 0b11 ],
    [ 'matches-css', 0b11 ],
    [ 'matches-media', 0b11 ],
    [ 'matches-path', 0b11 ],
    [ 'min-text-length', 0b01 ],
    [ 'not', 0b01 ],
    [ 'nth-ancestor', 0b00 ],
    [ 'others', 0b11 ],
    [ 'remove', 0b11 ],
    [ 'remove-attr', 0b11 ],
    [ 'remove-class', 0b11 ],
    [ 'style', 0b11 ],
    [ 'upward', 0b01 ],
    [ 'watch-attr', 0b11 ],
    [ 'watch-attrs', 0b00 ],
    [ 'xpath', 0b01 ],
]);

/******************************************************************************/

export const utils = (( ) => {

    // Depends on:
    // https://github.com/foo123/RegexAnalyzer
    const regexAnalyzer = Regex && Regex.Analyzer || null;

    class regex {
        static firstCharCodeClass(s) {
            return /^[\x01\x03%0-9A-Za-z]/.test(s) ? 1 : 0;
        }

        static lastCharCodeClass(s) {
            return /[\x01\x03%0-9A-Za-z]$/.test(s) ? 1 : 0;
        }

        static tokenizableStrFromNode(node) {
            switch ( node.type ) {
            case 1: /* T_SEQUENCE, 'Sequence' */ {
                let s = '';
                for ( let i = 0; i < node.val.length; i++ ) {
                    s += this.tokenizableStrFromNode(node.val[i]);
                }
                return s;
            }
            case 2: /* T_ALTERNATION, 'Alternation' */
            case 8: /* T_CHARGROUP, 'CharacterGroup' */ {
                if ( node.flags.NegativeMatch ) { return '\x01'; }
                let firstChar = 0;
                let lastChar = 0;
                for ( let i = 0; i < node.val.length; i++ ) {
                    const s = this.tokenizableStrFromNode(node.val[i]);
                    if ( firstChar === 0 && this.firstCharCodeClass(s) === 1 ) {
                        firstChar = 1;
                    }
                    if ( lastChar === 0 && this.lastCharCodeClass(s) === 1 ) {
                        lastChar = 1;
                    }
                    if ( firstChar === 1 && lastChar === 1 ) { break; }
                }
                return String.fromCharCode(firstChar, lastChar);
            }
            case 4: /* T_GROUP, 'Group' */ {
                if (
                    node.flags.NegativeLookAhead === 1 ||
                    node.flags.NegativeLookBehind === 1
                ) {
                    return '';
                }
                return this.tokenizableStrFromNode(node.val);
            }
            case 16: /* T_QUANTIFIER, 'Quantifier' */ {
                if ( node.flags.max === 0 ) { return ''; }
                const s = this.tokenizableStrFromNode(node.val);
                const first = this.firstCharCodeClass(s);
                const last = this.lastCharCodeClass(s);
                if ( node.flags.min !== 0 ) {
                    return String.fromCharCode(first, last);
                }
                return String.fromCharCode(first+2, last+2);
            }
            case 64: /* T_HEXCHAR, 'HexChar' */ {
                if (
                    node.flags.Code === '01' ||
                    node.flags.Code === '02' ||
                    node.flags.Code === '03'
                ) {
                    return '\x00';
                }
                return node.flags.Char;
            }
            case 128: /* T_SPECIAL, 'Special' */ {
                const flags = node.flags;
                if (
                    flags.EndCharGroup === 1 || // dangling `]`
                    flags.EndGroup === 1 ||     // dangling `)`
                    flags.EndRepeats === 1      // dangling `}`
                ) {
                    throw new Error('Unmatched bracket');
                }
                return flags.MatchEnd === 1 ||
                       flags.MatchStart === 1 ||
                       flags.MatchWordBoundary === 1
                    ? '\x00'
                    : '\x01';
            }
            case 256: /* T_CHARS, 'Characters' */ {
                for ( let i = 0; i < node.val.length; i++ ) {
                    if ( this.firstCharCodeClass(node.val[i]) === 1 ) {
                        return '\x01';
                    }
                }
                return '\x00';
            }
            // Ranges are assumed to always involve token-related characters.
            case 512: /* T_CHARRANGE, 'CharacterRange' */ {
                return '\x01';
            }
            case 1024: /* T_STRING, 'String' */ {
                return node.val;
            }
            case 2048: /* T_COMMENT, 'Comment' */ {
                return '';
            }
            default:
                break;
            }
            return '\x01';
        }

        static isValid(reStr) {
            try {
                void new RegExp(reStr);
                if ( regexAnalyzer !== null ) {
                    void this.tokenizableStrFromNode(
                        regexAnalyzer(reStr, false).tree()
                    );
                }
            } catch(ex) {
                return false;
            }
            return true;
        }

        static isRE2(reStr) {
            if ( regexAnalyzer === null ) { return true; }
            let tree;
            try {
                tree = regexAnalyzer(reStr, false).tree();
            } catch(ex) {
                return;
            }
            const isRE2 = node => {
                if ( node instanceof Object === false ) { return true; }
                if ( node.flags instanceof Object ) {
                    if ( node.flags.LookAhead === 1 ) { return false; }
                    if ( node.flags.NegativeLookAhead === 1 ) { return false; }
                    if ( node.flags.LookBehind === 1 ) { return false; }
                    if ( node.flags.NegativeLookBehind === 1 ) { return false; }
                }
                if ( Array.isArray(node.val) ) {
                    for ( const entry of node.val ) {
                        if ( isRE2(entry) === false ) { return false; }
                    }
                }
                if ( node.val instanceof Object ) {
                    return isRE2(node.val);
                }
                return true;
            };
            return isRE2(tree);
        }

        static toTokenizableStr(reStr) {
            if ( regexAnalyzer === null ) { return ''; }
            let s = '';
            try {
                s = this.tokenizableStrFromNode(
                    regexAnalyzer(reStr, false).tree()
                );
            } catch(ex) {
            }
            // Process optional sequences
            const reOptional = /[\x02\x03]+/;
            for (;;) {
                const match = reOptional.exec(s);
                if ( match === null ) { break; }
                const left = s.slice(0, match.index);
                const middle = match[0];
                const right = s.slice(match.index + middle.length);
                s = left;
                s += this.firstCharCodeClass(right) === 1 ||
                        this.firstCharCodeClass(middle) === 1
                    ? '\x01'
                    : '\x00';
                s += this.lastCharCodeClass(left) === 1 ||
                        this.lastCharCodeClass(middle) === 1
                    ? '\x01'
                    : '\x00';
                s += right;
            }
            return s;
        }
    }

    const preparserTokens = new Map([
        [ 'ext_ublock', 'ublock' ],
        [ 'ext_ubol', 'ubol' ],
        [ 'ext_devbuild', 'devbuild' ],
        [ 'env_chromium', 'chromium' ],
        [ 'env_edge', 'edge' ],
        [ 'env_firefox', 'firefox' ],
        [ 'env_legacy', 'legacy' ],
        [ 'env_mobile', 'mobile' ],
        [ 'env_mv3', 'mv3' ],
        [ 'env_safari', 'safari' ],
        [ 'cap_html_filtering', 'html_filtering' ],
        [ 'cap_user_stylesheet', 'user_stylesheet' ],
        [ 'false', 'false' ],
        // Hoping ABP-only list maintainers can at least make use of it to
        // help non-ABP content blockers better deal with filters benefiting
        // only ABP.
        [ 'ext_abp', 'false' ],
        // Compatibility with other blockers
        // https://kb.adguard.com/en/general/how-to-create-your-own-ad-filters#adguard-specific
        [ 'adguard', 'adguard' ],
        [ 'adguard_app_android', 'false' ],
        [ 'adguard_app_ios', 'false' ],
        [ 'adguard_app_mac', 'false' ],
        [ 'adguard_app_windows', 'false' ],
        [ 'adguard_ext_android_cb', 'false' ],
        [ 'adguard_ext_chromium', 'chromium' ],
        [ 'adguard_ext_edge', 'edge' ],
        [ 'adguard_ext_firefox', 'firefox' ],
        [ 'adguard_ext_opera', 'chromium' ],
        [ 'adguard_ext_safari', 'false' ],
    ]);

    const toURL = url => {
        try {
            return new URL(url.trim());
        } catch (ex) {
        }
    };

    // Useful reference:
    // https://adguard.com/kb/general/ad-filtering/create-own-filters/#conditions-directive

    class preparser {
        static evaluateExprToken(token, env = []) {
            const not = token.charCodeAt(0) === 0x21 /* ! */;
            if ( not ) { token = token.slice(1); }
            const state = preparserTokens.get(token);
            if ( state === undefined ) { return; }
            return state === 'false' && not || env.includes(state) !== not;
        }

        static evaluateExpr(expr, env = []) {
            if ( expr.startsWith('(') && expr.endsWith(')') ) {
                expr = expr.slice(1, -1);
            }
            const matches = Array.from(expr.matchAll(/(?:(?:&&|\|\|)\s+)?\S+/g));
            if ( matches.length === 0 ) { return; }
            if ( matches[0][0].startsWith('|') || matches[0][0].startsWith('&') ) { return; }
            let result = this.evaluateExprToken(matches[0][0], env);
            for ( let i = 1; i < matches.length; i++ ) {
                const parts = matches[i][0].split(/ +/);
                if ( parts.length !== 2 ) { return; }
                const state = this.evaluateExprToken(parts[1], env);
                if ( state === undefined ) { return; }
                if ( parts[0] === '||' ) {
                    result = result || state;
                } else if ( parts[0] === '&&' ) {
                    result = result && state;
                } else {
                    return;
                }
            }
            return result;
        }

        // This method returns an array of indices, corresponding to position in
        // the content string which should alternatively be parsed and discarded.
        static splitter(content, env = []) {
            const reIf = /^!#(if|else|endif)\b([^\n]*)(?:[\n\r]+|$)/gm;
            const stack = [];
            const parts = [ 0 ];
            let discard = false;

            const shouldDiscard = ( ) => stack.some(v => v);

            const begif = (startDiscard, match) => {
                if ( discard === false && startDiscard ) {
                    parts.push(match.index);
                    discard = true;
                }
                stack.push(startDiscard);
            };

            const endif = match => {
                stack.pop();
                const stopDiscard = shouldDiscard() === false;
                if ( discard && stopDiscard ) {
                    parts.push(match.index + match[0].length);
                    discard = false;
                }
            };

            for (;;) {
                const match = reIf.exec(content);
                if ( match === null ) { break; }

                switch ( match[1] ) {
                case 'if': {
                    const startDiscard = this.evaluateExpr(match[2].trim(), env) === false;
                    begif(startDiscard, match);
                    break;
                }
                case 'else': {
                    if ( stack.length === 0 ) { break; }
                    const startDiscard = stack[stack.length-1] === false;
                    endif(match);
                    begif(startDiscard, match);
                    break;
                }
                case 'endif': {
                    endif(match);
                    break;
                }
                default:
                    break;
                }
            }

            parts.push(content.length);
            return parts;
        }

        static expandIncludes(parts, env = []) {
            const out = [];
            const reInclude = /^!#include +(\S+)[^\n\r]*(?:[\n\r]+|$)/gm;
            for ( const part of parts ) {
                if ( typeof part === 'string' ) {
                    out.push(part);
                    continue;
                }
                if ( part instanceof Object === false ) { continue; }
                const content = part.content;
                const slices = this.splitter(content, env);
                for ( let i = 0, n = slices.length - 1; i < n; i++ ) {
                    const slice = content.slice(slices[i+0], slices[i+1]);
                    if ( (i & 1) !== 0 ) {
                        out.push(slice);
                        continue;
                    }
                    let lastIndex = 0;
                    for (;;) {
                        const match = reInclude.exec(slice);
                        if ( match === null ) { break; }
                        if ( toURL(match[1]) !== undefined ) { continue; }
                        if ( match[1].indexOf('..') !== -1 ) { continue; }
                        // Compute nested list path relative to parent list path
                        const pos = part.url.lastIndexOf('/');
                        if ( pos === -1 ) { continue; }
                        const subURL = part.url.slice(0, pos + 1) + match[1].trim();
                        out.push(
                            slice.slice(lastIndex, match.index + match[0].length),
                            `! >>>>>>>> ${subURL}\n`,
                            { url: subURL },
                            `! <<<<<<<< ${subURL}\n`
                        );
                        lastIndex = reInclude.lastIndex;
                    }
                    out.push(lastIndex === 0 ? slice : slice.slice(lastIndex));
                }
            }
            return out;
        }

        static prune(content, env) {
            const parts = this.splitter(content, env);
            const out = [];
            for ( let i = 0, n = parts.length - 1; i < n; i += 2 ) {
                const beg = parts[i+0];
                const end = parts[i+1];
                out.push(content.slice(beg, end));
            }
            return out.join('\n');
        }

        static getHints() {
            const out = [];
            const vals = new Set();
            for ( const [ key, val ] of preparserTokens ) {
                if ( vals.has(val) ) { continue; }
                vals.add(val);
                out.push(key);
            }
            return out;
        }

        static getTokens(env) {
            const out = new Map();
            for ( const [ key, val ] of preparserTokens ) {
                out.set(key, val !== 'false' && env.includes(val));
            }
            return Array.from(out);
        }
    }

    return {
        preparser,
        regex,
    };
})();

/******************************************************************************/
