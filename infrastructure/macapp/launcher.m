// DSA Mastery OS — native macOS launcher (a real Cocoa app).
//
// Why this exists: a bare shell-script ".app" is NOT a real GUI app — it never
// connects to the window server, so it never becomes frontmost (Cmd-Q hits the
// browser instead) and it can't answer the re-open Apple Event (double-clicking
// again shows "not responding"). This is a genuine NSApplication, so the Dock
// icon, activation, and Cmd-Q all behave correctly.
//
//   Launch (double-click) -> runs `pnpm study:prod` (1 server + sync + browser)
//   Quit  (Cmd-Q / Dock>Quit) -> runs `pnpm study:stop` (backup SQLite + shutdown)
//
// The repo path is compiled in: build.sh passes -DDSA_REPO derived from its own
// location. The fallback below only applies when compiling launcher.m by hand.

#import <Cocoa/Cocoa.h>

#ifndef DSA_REPO
#define DSA_REPO "/path/to/dsa-mastery-os"
#endif

static NSString * const kRepo = @DSA_REPO;

// Run a bash snippet. When wait==NO the call returns immediately (used to start
// the servers detached); when wait==YES it blocks until completion (used so the
// shutdown finishes before the app exits).
static void RunShell(NSString *script, BOOL wait) {
    NSTask *task = [[NSTask alloc] init];
    task.launchPath = @"/bin/bash";
    task.arguments = @[@"-c", script];
    @try {
        [task launch];
        if (wait) [task waitUntilExit];
    } @catch (NSException *ex) {
        NSLog(@"DSA Mastery OS: failed to run shell: %@", ex);
    }
}

// Finder/launchd give a .app a minimal PATH, so rebuild it for node/pnpm.
static NSString *PathPrelude(void) {
    return @"export PATH=\"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH\"; "
            "export PNPM_HOME=\"$HOME/Library/pnpm\"; "
            "export PATH=\"$PNPM_HOME:$HOME/.local/share/pnpm:$PATH\"; ";
}

@interface AppDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic) BOOL started;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)note {
    if (self.started) return;     // guard against a duplicate launch
    self.started = YES;
    // Start servers + sync + browser, detached so they outlive this callback
    // and survive the app quitting (study:stop is what actually stops them).
    NSString *start = [NSString stringWithFormat:
        @"%@ cd '%@' || exit 1; mkdir -p .study; "
         "echo \"=== launch (app) $(date) ===\" >> .study/launcher.log; "
         "nohup bash infrastructure/scripts/study-prod.sh >> .study/launcher.log 2>&1 &",
        PathPrelude(), kRepo];
    RunShell(start, NO);
}

- (void)applicationWillTerminate:(NSNotification *)note {
    // Quit-to-stop: back up SQLite and shut the servers down. Synchronous so it
    // finishes before the process exits.
    NSString *stop = [NSString stringWithFormat:
        @"%@ cd '%@' || exit 1; "
         "echo \"=== quit (app) $(date) — stopping ===\" >> .study/launcher.log; "
         "bash infrastructure/scripts/study-stop.sh >> .study/launcher.log 2>&1",
        PathPrelude(), kRepo];
    RunShell(stop, YES);
}

// No windows — don't quit just because none are open; stay in the Dock.
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return NO;
}
@end

// Minimal main menu so Cmd-Q works when the app is frontmost.
static void InstallMenu(NSApplication *app) {
    NSMenu *menubar = [[NSMenu alloc] init];
    NSMenuItem *appItem = [[NSMenuItem alloc] init];
    [menubar addItem:appItem];
    [app setMainMenu:menubar];

    NSMenu *appMenu = [[NSMenu alloc] init];
    NSString *name = @"DSA Mastery OS";
    [appMenu addItemWithTitle:[NSString stringWithFormat:@"About %@", name]
                       action:NULL keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    NSMenuItem *quit = [[NSMenuItem alloc]
        initWithTitle:[NSString stringWithFormat:@"Quit %@", name]
               action:@selector(terminate:)
        keyEquivalent:@"q"];
    [appMenu addItem:quit];
    [appItem setSubmenu:appMenu];
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        [app setDelegate:delegate];
        // Regular = real Dock icon + menu bar (so it can be focused and quit).
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        InstallMenu(app);
        [app activateIgnoringOtherApps:YES];
        [app run];
    }
    return 0;
}
