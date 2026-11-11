//yt-ad-skip-agent-standalone-worker

const mMode = {
    OFF   : "OFF",
    MANUAL: "MANUAL",
    AUTO  : "AUTO"
};

const m_nextmode = {
    [mMode.OFF]   : mMode.MANUAL,
    [mMode.MANUAL]: mMode.AUTO,
    [mMode.AUTO]  : mMode.OFF
};

const mSuspendAlarmName = "suspend_timer";
const mSuspendDelayMin  = 180;

let mIsSuspend = false;

chrome.idle.setDetectionInterval( 30 );

async function init()
{
    const pref = await chrome.storage.local.get( "mode" );

    chrome.idle.queryState( 30, ( state ) => {
        set_suspend_alarm( state );
    } );

    if( ( ! Object.hasOwn( pref, "mode" ) ) || ( ! Object.hasOwn( mMode, pref.mode ) ) ){
        pref.mode = mMode.OFF;
        await chrome.storage.local.set( { mode: pref.mode } );
    }

    displayStatus( pref.mode );
}

function rotMode( mode )
{
    return m_nextmode[mode] ?? mMode.OFF;
}

function displayStatus( mode )
{
    let text;
    let bgcolor;

    if( Object.hasOwn( mMode, mode ) ){
        if( mode === mMode.OFF ){
            text    = "";
            bgcolor = "#666666";
        } else{
            text    = mode.slice( 0, 3 );
            bgcolor = "#CC0000";
        }
    } else{
        throw( new Error( `Invalid status:${mode}` ) );
    }

    chrome.action.setBadgeText( { text: text } );
    chrome.action.setBadgeBackgroundColor( { color: bgcolor } );
}

function set_suspend_alarm( state )
{
    if( state === "active" ){
        chrome.alarms.clear( mSuspendAlarmName );
        mIsSuspend = false;
    } else{
        chrome.alarms.create( mSuspendAlarmName, {
            delayInMinutes: mSuspendDelayMin
        } );
    }
}


chrome.alarms.onAlarm.addListener( ( alarm ) => {
    if( alarm.name === mSuspendAlarmName ){
        mIsSuspend = true;
    }
} );

chrome.runtime.onMessage.addListener( async ( msg, sender ) => {
    if( ! sender.tab ) return;

    msg.tabId = sender.tab.id;

    switch( msg.msg ){
        case "READY":{
            const pref = await chrome.storage.local.get( "mode" );
            if( pref.mode === mMode.AUTO ){
                chrome.tabs.sendMessage( msg.tabId, { msg: "AUTO_SKIP_START" } ).catch( ( e ) => {
                    console.error( "Failed to send AUTO_SKIP_START.", e );
                } );
            }
            break;
        }
        case "SKIPNODE_FOUND": {
            if( mIsSuspend ) break;

            let attached = false;

            try{
                await chrome.debugger.attach( { tabId: msg.tabId }, "1.3" );

                attached = true;
                
                await chrome.debugger.sendCommand(
                    { tabId: msg.tabId },
                    "Input.dispatchMouseEvent",
                    {
                        type: "mousePressed",
                        x: msg.params.x,
                        y: msg.params.y,
                        button: "left",
                        clickCount: 1
                    }
                );

                await chrome.debugger.sendCommand(
                    { tabId: msg.tabId },
                    "Input.dispatchMouseEvent",
                    {
                        type: "mouseReleased",
                        x: msg.params.x,
                        y: msg.params.y,
                        button: "left",
                        clickCount: 1
                    }
                );
            } catch( e ){
                console.error( "Failed to click skip.", e );
            } finally{
                if( attached ){
                    await chrome.debugger.detach( { tabId: msg.tabId } ).catch( () => {} );
                }
            }
            break;
        } 
    }
} );

chrome.action.onClicked.addListener( async () => {
    let cur, prev_mode;

    try{
        cur = await chrome.storage.local.get( "mode" );

        prev_mode = cur.mode;
        cur.mode = rotMode( cur.mode );

        await chrome.storage.local.set( cur );

        displayStatus( cur.mode );
    } catch( e ){
        if( ! Object.hasOwn( mMode, cur.mode ) ){
            prev_mode = mMode.OFF;
            cur.mode  = mMode.OFF;
        }
        console.error( "Failed to read/write configuration", e );
    }

    if( cur.mode !== prev_mode && ( cur.mode === mMode.AUTO || prev_mode === mMode.AUTO ) ){
        try{
            const manifest = chrome.runtime.getManifest();
            const urls = manifest.content_scripts.flatMap( script => script.matches );
            const tabs = await chrome.tabs.query( { url: urls } );

            if( cur.mode === mMode.AUTO ){
                tabs.filter( ( tab ) => ! tab.discarded ).forEach( ( tab ) => {
                    chrome.tabs.sendMessage( tab.id, { msg: "AUTO_SKIP_START" } ).catch( () => {} );
                } );
            } else{
                tabs.filter( ( tab ) => ! tab.discarded ).forEach( ( tab ) => {
                    chrome.tabs.sendMessage( tab.id, { msg: "AUTO_SKIP_STOP" } ).catch( () => {} );
                } );
            }
        } catch( e ){
            console.error( "Failed to send message of mode change.", e );
        }
    }
} );

chrome.commands.onCommand.addListener( async ( command ) => {
    if( command === "do-skip" ){
        const tabs = await chrome.tabs.query( {
            active: true,
            lastFocusedWindow: true
        } );
        if( ! tabs.length ) return;

        for( const tab of tabs ){
            await chrome.tabs.sendMessage( tab.id, { msg: "SKIPNODE_REQUEST" } ).catch( ( e ) => {
                console.error( e );
            } );
        }
    }
} );

chrome.idle.onStateChanged.addListener( ( state ) => {
    set_suspend_alarm( state );
} );

chrome.runtime.onInstalled.addListener( init );
chrome.runtime.onStartup.addListener( init );
