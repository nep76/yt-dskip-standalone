//yt-ad-skip-agent-standalone-worker

const SUSPEND_ALARM_NAME = "suspend_timer";
const SUSPEND_DELAY_MIN  = 180;

let is_suspend = false;

chrome.idle.setDetectionInterval( 30 );

async function init()
{
    let pref = await chrome.storage.local.get( "mode" );

    await chrome.idle.queryState( 30, ( state ) => {
        set_suspend_alarm( state );
    } );

    if( pref && "mode" in pref ){
        displayStatus( pref.mode );
    } else{
        await chrome.storage.local.set( { mode: 0 } );
        displayStatus( 0 );
    }
}

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

function set_suspend_alarm( state )
{
    if( state == "active" ){
        chrome.alarms.clear( SUSPEND_ALARM_NAME );
        is_suspend = false;
    } else{
        chrome.alarms.create( SUSPEND_ALARM_NAME, {
            delayInMinutes: SUSPEND_DELAY_MIN
        } );
    }
}

chrome.alarms.onAlarm.addListener( ( alarm ) => {
    if( alarm.name == SUSPEND_ALARM_NAME ){
        is_suspend = true;
    }
} );

chrome.runtime.onMessage.addListener( ( msg, sender, response ) => {
    if( ! sender.tab ) return;

    msg.windowId = sender.tab.windowId;
    msg.tabId    = sender.tab.id;

    switch( msg.msg ){
        case "CLICK_SKIP":
            if( is_suspend ) break;

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

chrome.idle.onStateChanged.addListener( ( state ) => {
    set_suspend_alarm( state );
} );

chrome.runtime.onInstalled.addListener( init );
chrome.runtime.onStartup.addListener( init );
