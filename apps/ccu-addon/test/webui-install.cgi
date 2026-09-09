#!/bin/tclsh
#
# Stands in for the WebUI's cp_software.cgi, the way it drives an addon (OpenCCU's
# 0040-WebUI-AddonInstallNoReboot patch): the installer and the uninstall run *inside the
# request*, through exec, and the page with the "installation successful" popup - or, for an
# uninstall, the refreshed list - is written only when they have returned. That is why an addon
# must not restart lighttpd from in there: the answer would have no connection left to go out on.
#
#   ?cmd=install     exec /bin/install_addon, prints "installed rc=<exit code>"
#   ?cmd=uninstall   exec rc.d/hmm uninstall, prints "uninstalled rc=<exit code>"

set cmd ""
catch {
    foreach pair [split $env(QUERY_STRING) &] {
        if {[regexp {^cmd=(.*)$} $pair dummy value]} {
            set cmd $value
        }
    }
}

proc run {args} {
    set result 0
    if {[catch {eval exec $args 2>/dev/null} output]} {
        if {[lindex $::errorCode 0] == "CHILDSTATUS"} {
            set result [lindex $::errorCode 2]
        } else {
            set result 100
        }
    }
    return $result
}

puts "Content-Type: text/plain\r\n"
switch -- $cmd {
    install {
        puts -nonewline "installed rc=[run /bin/install_addon]"
    }
    uninstall {
        puts -nonewline "uninstalled rc=[run /usr/local/etc/config/rc.d/hmm uninstall]"
    }
    default {
        puts "unknown command"
    }
}
