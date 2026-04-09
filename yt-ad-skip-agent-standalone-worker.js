//yt-ad-skip-agent-worker
// yt_ad_skip_input

let port = undefined;
let request_map = new Map();

const TIME_TO_INACTIVE = 20;

function rotMode( mode )
{
    mode++;
    if( mode > 2 ) mode = 0;

    return mode;
}

function displayStatus( state )
{
    let text;
    let bgcolor;

    switch( state ){
        case 1:
            text = "MAN";
            bgcolor = "#CC0000";
            break;
        case 2:
            text = "AUT";
            bgcolor = "#CC0000";
            break;
        default:
            text = "";
            bgcolor = "#666666";
    }

    chrome.action.setBadgeText( { text: text } );
    chrome.action.setBadgeBackgroundColor( { color: bgcolor } );
}

chrome.runtime.onMessage.addListener( ( msg, sender, response ) => {
    console.log( "onmessage:" + msg.msg);

    if( ! sender.tab ) return;

    msg.windowId = sender.tab.windowId;
    msg.tabId    = sender.tab.id;

    switch( msg.msg ){
        case "CLICK_SKIP":
            chrome.debugger.attach( { tabId: msg.tabId }, "1.3", async () => {
                await chrome.debugger.sendCommand(
                    { tabId: msg.tabId },
                    "Input.dispatchMouseEvent",
                    {
                        type: "mousePressed",
                        x: msg.params.cx,
                        y: msg.params.cy,
                        button: "left",
                        clickCount: 1
                    }
                );
                await chrome.debugger.sendCommand(
                    { tabId: msg.tabId },
                    "Input.dispatchMouseEvent",
                    {
                        type: "mouseReleased",
                        x: msg.params.cx,
                        y: msg.params.cy,
                        button: "left",
                        clickCount: 1
                    }
                );
                await chrome.debugger.detach( { tabId: msg.tabId } );
            } );
            break;
    }
} );

chrome.runtime.onInstalled.addListener( async () => {
    await chrome.storage.local.set( { mode: 0 } );
    displayStatus( 0 );
} );

chrome.action.onClicked.addListener( async () => {
    let pref = await chrome.storage.local.get( "mode" );
    pref.mode = rotMode( pref.mode );
    
    await chrome.storage.local.set( pref );
    displayStatus( pref.mode );
} );

chrome.commands.onCommand.addListener( async ( command ) => {
    if( command == "do-skip" ){
        const tabs = await chrome.tabs.query( { active: true } );
        if( ! tabs.length ) return;

        for( const tab of tabs ){
            try {
                await chrome.tabs.sendMessage( tab.id, { msg: "SKIP_REQUEST" } );
            } catch( e ){
                console.error( e );
            }
        }
    }
} );

( async () => {
    let pref = await chrome.storage.local.get( "mode" );

    if( pref && "mode" in pref ){
        displayStatus( pref.mode );
    } else{
        await chrome.storage.local.set( { mode: 0 } );
        displayStatus( 0 );
    }
} )();
