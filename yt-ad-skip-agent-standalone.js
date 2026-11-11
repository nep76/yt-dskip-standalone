// yt-ad-skip-agent-standalone

let mIntervalId = 0;

const mSelectorList = [
    "#button-shape",
    "#skip-button\\:2",
    ".ytp-skip-ad-button"
];

function get_skip_coord()
{
    if( document.hidden ) return;

    const skipbtn = document.querySelector( mSelectorList.join(",") );
    if( ! skipbtn ) return;

    const style = getComputedStyle( skipbtn );
    const rect  = skipbtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    if(
        skipbtn.offsetParent === null     ||
        style.display        === "none"   ||
        style.visibility     === "hidden" ||
        parseFloat( style.opacity ) === 0 ||
        cx < 0 ||
        cx > window.innerWidth ||
        cy < 0 ||
        cy > window.innerHeight
    ){
        return;
    }

    return { x: cx, y: cy }
}

function init()
{
    chrome.runtime.onMessage.addListener ( ( msg ) => {
        switch( msg.msg ){
            case "SKIPNODE_REQUEST":{
                const coord = get_skip_coord();
                chrome.runtime.sendMessage( {
                    msg: coord ? "SKIPNODE_FOUND" : "SKIPNODE_NOT_FOUND",
                    params: coord
                })
                break;
            }
            case "AUTO_SKIP_START":{
                if( ! mIntervalId ){
                    mIntervalId = setInterval( () => {
                        const coord = get_skip_coord();
                        if( coord ){
                            chrome.runtime.sendMessage( { msg: "SKIPNODE_FOUND", params: coord } );
                        }
                    }, 1000 );
                }
                break;
            }
            case "AUTO_SKIP_STOP":{
                if( mIntervalId ){
                    clearInterval( mIntervalId );
                    mIntervalId = 0;
                }
                break;
            }
        }
    } );

    chrome.runtime.sendMessage( { msg: "READY" } );
}

if( document.readyState === "loading" ){
    document.addEventListener( "DOMContentLoaded", init, { once: true } );
} else{
    init();
}
