const mCtrls = {
    mode: {
        OFF   : document.getElementById( "mode-off" ),
        MANUAL: document.getElementById( "mode-manual" ),
        AUTO  : document.getElementById( "mode-auto" )
    },
    breakPlaylist: document.getElementById( "break-playlist" ),
    thumbnail:{
        root  : document.getElementById( "thumbnail" ),
        anchor: document.getElementById( "thumbnail-href" ),
        img   : document.getElementById( "thumbnail-img" )
    }
};

let mTab = null;
let mUrl = null;

async function init()
{
    document.getElementById( "ext-name" ).addEventListener( "click", () => {
        window.close();
    } );

    const r = await chrome.runtime.sendMessage( { msg: "sw.config.mode.get" } );
    if( ! r?.success ){
        console.error( "Failed to get mode" );
    } else{
        mCtrls.mode[r.params].checked = true;
    }

    const tabs = await chrome.tabs.query( {
        active: true,
        lastFocusedWindow: true
    } );

    if( ! tabs.length ) return;

    mTab = tabs[0];
    
    try {
        mUrl = new URL( mTab.url );
    } catch{
        //console.error( "Failed to create URL object.", e );
    }
}

function set_mode( e )
{
    chrome.runtime.sendMessage( { msg: "sw.config.mode.set", params: e.target.value } );
}

function setup_mode_switch()
{
    mCtrls.mode.OFF.addEventListener( "change", set_mode );
    mCtrls.mode.MANUAL.addEventListener( "change", set_mode );
    mCtrls.mode.AUTO.addEventListener( "change", set_mode );
}

function setup_break_playlist()
{
    if( mTab && mUrl?.searchParams.has( "list" ) ){
        mCtrls.breakPlaylist.disabled = false;

        mCtrls.breakPlaylist.addEventListener( "click", async () => {
            const vid = mUrl.searchParams.get( "v" );
            if( ! vid ){
                console.error( "Video-ID(v=) not found." );
                return;
            }

            mUrl.search = "";
            mUrl.searchParams.set( "v", vid );
            
            chrome.tabs.update( mTab.id, { url: mUrl.href } );
            window.close();
        } );
    } else{
        mCtrls.breakPlaylist.disabled = true;
    }
}

function setup_thumbnail()
{
    const vid = mTab && mUrl?.searchParams.get( "v" );
    if( vid ){
        mCtrls.thumbnail.img.src     = `https://i.ytimg.com/vi/${vid}/0.jpg`;
        mCtrls.thumbnail.anchor.href = mCtrls.thumbnail.img.src;
        mCtrls.thumbnail.root.hidden = false;
    } else{
        mCtrls.thumbnail.img.removeAttribute( "src" );
        mCtrls.thumbnail.anchor.removeAttribute( "href" );
        mCtrls.thumbnail.root.hidden = true;
    }
}

( async () => {
    await init();
    setup_mode_switch();
    setup_break_playlist();
    setup_thumbnail();
} )();
