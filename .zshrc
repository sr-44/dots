# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# See https://github.com/ohmyzsh/ohmyzsh/wiki/Themes
ZSH_THEME="robbyrussell"

ENABLE_CORRECTION="true"

plugins=(git zsh-syntax-highlighting tmux)
source $ZSH/oh-my-zsh.sh


# aliases
alias :c="clear"
alias nv="nvim"
alias nf="neofetch"
alias dots="cd ~/dots/"
alias :wq="exit"
alias :xz="poweroff"
alias slp="systemctl suspend"
alias out="pkill -KILL -u $(whoami)"
alias wflist="nmcli device wifi list"
alias wfconnect="nmcli -ask device wifi connect"


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


___MY_VMOPTIONS_SHELL_FILE="${HOME}/.jetbrains.vmoptions.sh"; if [ -f "${___MY_VMOPTIONS_SHELL_FILE}" ]; then . "${___MY_VMOPTIONS_SHELL_FILE}"; fi

#export GTK_IM_MODULE=ibus
#export QT_IM_MODULE=ibus
#export XMODIFIERS=@im=ibus
export PATH=$PATH:/home/ar4sh/.config/composer/vendor/bin
