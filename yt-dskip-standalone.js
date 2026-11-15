// github: https://github.com/nep76/yt-dskip-standalone

let mIntervalId = 0;

const mSelectorList = [
    "button.ytp-ad-skip-button-modern.ytp-button", //スマホ用
    ".ytp-skip-ad-button", // PC用
//    "#button-shape" // テスト用
];

const mMouse = {
    pos: {
        x: 0,
        y: 0
    }
}

let mDeferOnHover = false;
let mIsPending = false;

function update_mouse( ctx )
{
    mMouse.pos.x = ctx.clientX;
    mMouse.pos.y = ctx.clientY;
}

async function init()
{
    if( document.readyState === "loading" ){
        await new Promise( ( resolve ) => {
            document.addEventListener( "DOMContentLoaded", resolve, { once: true } );
        } );
    }

    chrome.runtime.sendMessage( { msg: "sw.signal.ready" } );
}

function get_skip_coord()
{
    if( document.hidden ) return;

    const skipbtn = document.querySelector( mSelectorList.join(",") );
    if( ! skipbtn ) return;

    if( mDeferOnHover ){
        const player = document.querySelector( "video" );
        if( player ){
            const rect = player.getBoundingClientRect();
            if(
                mMouse.pos.x >= rect.left  && mMouse.pos.x <= rect.right &&
                mMouse.pos.y >= rect.top   && mMouse.pos.y <= rect.bottom
            ) return;
        }
    }

    const rect = skipbtn.getBoundingClientRect();
    const cx   = rect.left + rect.width / 2;
    const cy   = rect.top + rect.height / 2;
    const hit  = document.elementFromPoint( cx, cy );
    if(
        ! skipbtn.checkVisibility( { checkOpacity: true, checkVisibilityCSS: true } ) ||
        ( hit !== skipbtn && ! skipbtn.contains( hit ) ) ||
        skipbtn.offsetParent === null ||
        skipbtn.matches( ":disabled" ) ||
        skipbtn.getAttribute( "aria-disabled" ) === "true" ||
        cx < 0 ||
        cx > window.innerWidth ||
        cy < 0 ||
        cy > window.innerHeight
    ){
        return;
    }

    return { x: cx, y: cy }
}

async function send_skipnode( status, coord )
{
    if( mIsPending ) return;

    mIsPending = true;
    
    await chrome.runtime.sendMessage( {
        msg: status,
        params: coord
    } ).catch( ( e ) => {
        console.error( "Failed to send skipnode message", e );
    } ).finally( () => {
        mIsPending = false;
    } );
}

chrome.runtime.onMessage.addListener ( ( msg, _sender, response ) => {
    ( async () => {
        await mInitPromise;

        switch( msg.msg ){
            case "cs.adskip.node.discover":{
                const coord = get_skip_coord();
                send_skipnode( coord ? "sw.adskip.node.found" : "sw.adskip.node.notfound", coord );
                break;
            }
            case "cs.adskip.auto.start":{
                if( ! mIntervalId ){
                    mIntervalId = setInterval( () => {
                        const coord = get_skip_coord();
                        if( coord ){
                            send_skipnode( "sw.adskip.node.found", coord );
                        }
                    }, 1000 );
                    document.addEventListener( "mousemove", update_mouse );
                    mDeferOnHover = msg.params?.deferOnHover;
                }
                break;
            }
            case "cs.adskip.auto.stop":{
                if( mIntervalId ){
                    document.removeEventListener( "mousemove", update_mouse );
                    clearInterval( mIntervalId );
                    mIntervalId = 0;
                    mDeferOnHover = false;
                }
                break;
            }
            default:
                throw new Error( `Unknown message: ${msg.msg}`);
        }

        response( { success: true } );
    } )().catch( ( e ) => {
        console.error( e );
        response( { success: false } );
    } );

    return true;
} );

const mInitPromise = init();

