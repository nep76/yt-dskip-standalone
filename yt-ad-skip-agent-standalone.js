// yt-ad-skip-agent-standalone

let pref = undefined;
let interval_id = 0;

const _SelectorList = [
    //"#button-shape",
    "#skip-button\\:2",
    ".ytp-skip-ad-button"
];

async function get_skip_coord()
{
    if( ! pref.mode || document.hidden ) return;

    const skipbtn = document.querySelector( _SelectorList.join(",") );
    if( ! skipbtn ) return;

    const style = getComputedStyle( skipbtn );
    const rect  = skipbtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    if(
        skipbtn.offsetParent == null     ||
        style.display        == "none"   ||
        style.visibility     == "hidden" ||
        parseFloat( style.opacity ) == 0 ||
        cx < 0 ||
        cx > window.innerWidth ||
        cy < 0 ||
        cy > window.innerHeight
    ){
        return;
    }

    await chrome.runtime.sendMessage( {
        msg: "CLICK_SKIP",
        params: {
            cx: cx,
            cy: cy,      
            width: rect.width,
            height: rect.height
        }
    } );
}

chrome.storage.onChanged.addListener( ( changes, area ) => {
    if( area == "local" && changes.mode ){
        if( changes.mode.newValue != 2 && interval_id ){
            clearInterval( interval_id );
            interval_id = 0;
        } else if( changes.mode.newValue == 2 && ! interval_id ){
            interval_id = setInterval( get_skip_coord, 1000 );
        }
        pref.mode = changes.mode.newValue;
    }
} );

chrome.runtime.onMessage.addListener ( ( msg, sender, response ) => {
    if( pref.mode == 1 ) get_skip_coord();
} );

( async () => {
    pref = await chrome.storage.local.get( [ "mode" ] );
    if( pref.mode == 2 && ! interval_id ){
        interval_id = setInterval( get_skip_coord, 1000 );
    }
} )();
