// github: https://github.com/nep76/yt-dskip-standalone

let mNotification;
let mIntervalId = 0;

const mSelectorList = [
    "button.ytp-ad-skip-button-modern.ytp-button", //スマホ用
    ".ytp-skip-ad-button", // PC用
    //"#button-shape" // テスト用
];

const mPointer = {
    isValid: false,
    pos: {
        x: 0,
        y: 0
    }
}
const mCancelAutoSkip = {
    enabled: false,
    waitForSkipNode: false
};

let mDeferOnHover = false;
let mIsPending = false;

function invalidate_pointer()
{
    mPointer.isValid = false;
}

function update_pointer( ctx )
{
    mPointer.isValid = true;
    mPointer.pos.x = ctx.clientX;
    mPointer.pos.y = ctx.clientY;
}

function touch_autoskip_pending( ctx )
{
    if( ctx.pointerType === "touch" ) update_pointer( ctx );
}

function touch_autoskip_reset( ctx )
{
    if( ctx.pointerType === "touch" ) invalidate_pointer();
}

async function init()
{
    if( document.readyState === "loading" ){
        await new Promise( ( resolve ) => {
            document.addEventListener( "DOMContentLoaded", resolve, { once: true } );
        } );
    }

    // Unsafe origin エラーがでる
    //const mod = await import( chrome.runtime.getURL( "ToastNotification.js" ) );
    //mNotification = new mod.default();
    mNotification = new ToastNotification();
    document.body.appendChild( mNotification.getRootElement() );

    chrome.runtime.sendMessage( { msg: "sw.signal.ready" } );
}

function get_skip_coord( force_skip )
{
    if( document.hidden ) return;

    const skipbtn = document.querySelector( mSelectorList.join(",") );
    if( ! skipbtn ){
        if( ! mCancelAutoSkip.waitForSkipNode ) mCancelAutoSkip.enabled = false;
        return;
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
        if( ! mCancelAutoSkip.waitForSkipNode ) mCancelAutoSkip.enabled = false;
        return;
    }

    mCancelAutoSkip.waitForSkipNode = false;

    if( ! force_skip ){
        if( mCancelAutoSkip.enabled ){
            return;
        } else{
            if( mDeferOnHover && mPointer.isValid ){
                const player = document.querySelector( "video" );
                if( player ){
                    const rect = player.getBoundingClientRect();
                    if(
                        mPointer.pos.x >= rect.left && mPointer.pos.x <= rect.right &&
                        mPointer.pos.y >= rect.top  && mPointer.pos.y <= rect.bottom
                    ){
                        mNotification.show( "広告自動スキップが保留されています" );
                        return;
                    }
                }
            }
        }
    }

    mNotification.hide();

    return { x: cx, y: cy }
}

function cancel_autoskip( e )
{
    if( mCancelAutoSkip.enabled ) return;

    const player = document.querySelector( "video" );
    if( player ){
        const rect = player.getBoundingClientRect();
        if(
            e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top  && e.clientY <= rect.bottom
        ){
            mCancelAutoSkip.enabled         = true;
            mCancelAutoSkip.waitForSkipNode = true;
            mNotification.show( "再生中、または次の広告の自動スキップをキャンセルします" );

            e.preventDefault();
            e.stopPropagation();
        }
    }
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

function setup_handlers_for_autoskip_interaction( setup )
{
    const action = setup ? "addEventListener" : "removeEventListener";

    document[action]( "mousemove", update_pointer );
    document.documentElement[action]( "mouseleave", invalidate_pointer );
    document[action]( "visibilitychange", invalidate_pointer );
    window[action]( "blur", invalidate_pointer );
    document[action]( "contextmenu", cancel_autoskip );
    document[action]( "pointerdown", touch_autoskip_pending );
    document[action]( "pointerup", touch_autoskip_reset );
}

chrome.runtime.onMessage.addListener ( ( msg, _sender, response ) => {
    ( async () => {
        await mInitPromise;

        switch( msg.msg ){
            case "cs.adskip.node.discover":{
                const coord = get_skip_coord( true );
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
                }
                
                const new_doh = Boolean( msg.params?.deferOnHover );
                if( mDeferOnHover !== new_doh ){
                    setup_handlers_for_autoskip_interaction( new_doh );
                    mDeferOnHover = new_doh;
                    mCancelAutoSkip.enabled = false;
                }
                break;
            }
            case "cs.adskip.auto.stop":{
                if( mIntervalId ){
                    clearInterval( mIntervalId );
                    mIntervalId = 0;
                }
                if( mDeferOnHover ){
                    setup_handlers_for_autoskip_interaction( false );
                    mDeferOnHover = false;
                    mCancelAutoSkip.enabled = false;
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
