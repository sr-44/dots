# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# See https://github.com/ohmyzsh/ohmyzsh/wiki/Themes
ZSH_THEME="robbyrussell"

ENABLE_CORRECTION="false"

plugins=(git zsh-syntax-highlighting tmux artisan)
source $ZSH/oh-my-zsh.sh


# aliases
alias :c="clear"
alias :C="clear"
alias nv="nvim"
alias nf="neofetch"
alias ff="fastfetch"
alias y="yazi"
alias b="bat"
alias dots="cd ~/dots/"
alias :wq="exit"
alias :off="poweroff"
alias slp="systemctl suspend"
alias out="pkill -KILL -u $(whoami)"
alias out-user="sudo pkill -KILL -u"
alias wflist="nmcli device wifi list"
alias wfconnect="nmcli -ask device wifi connect"
alias c="gcc -std=c99 -fdiagnostics-color=always"
alias sail='[ -f sail ] && bash sail || bash vendor/bin/sail'
alias phpstan='./vendor/bin/phpstan'
alias dstart="sudo systemctl start docker"
alias dstop="sudo systemctl stop docker.service docker.socket"
alias phpstart="sudo systemctl start php-fpm nginx mariadb"
alias phpstop="sudo systemctl stop php-fpm nginx mariadb"
alias botrun="php artisan nutgram:run"
alias helper="~/projects/personal/helper-cli/cli"
alias stmd="sudo systemctl"
alias t="touch"
alias a="artisan"
alias blon="sudo systemctl start bluetooth.service"
alias bloff="sudo systemctl stop bluetooth"
alias commit="git add . && git commit -am"
alias open="xdg-open"
alias restart_hyprlock="hyprctl --instance 0 'keyword misc:allow_session_lock_restore 1' && hyprctl --instance 0 'dispatch exec hyprlock'"



# functions
function proxy_on() {
    export no_proxy="localhost,127.0.0.1,localaddress,.loc"

    if [[ $1 != "" ]]; then
        local proxy=$1
        export http_proxy="$proxy" \
            https_proxy=$proxy \
            ftp_proxy=$proxy \
            rsync_proxy=$proxy
        echo "Proxy set"
        return 0
    fi

    echo -n "server: "
    read server
    echo -n "port: "
    read port

    if [[ $port -eq "" ]]; then
        local port=44355
    fi

    local proxy=$server:$port
    export http_proxy="$proxy" \
        https_proxy=$proxy \
        ftp_proxy=$proxy \
        rsync_proxy=$proxy \
        HTTP_PROXY=$proxy \
        HTTPS_PROXY=$proxy \
        FTP_PROXY=$proxy \
        RSYNC_PROXY=$proxy
}

function proxy_off() {
    unset http_proxy https_proxy ftp_proxy rsync_proxy \
        HTTP_PROXY HTTPS_PROXY FTP_PROXY RSYNC_PROXY
    echo -e "Proxy environment variable removed."
}


export PATH=$PATH:/home/ar4sh/.local/bin/:/home/ar4sh/.config/composer/vendor/bin
export PATH="$PATH:/home/ar4sh/.local/share/JetBrains/Toolbox/scripts"

