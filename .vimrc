set encoding=utf8

set nocompatible

set ignorecase

set smartcase

set hlsearch

set incsearch

set tabstop=4
set softtabstop=4
set shiftwidth=4
set expandtab
set smarttab

set autoindent
set smartindent

set number


set wildmode=longest,list

syntax on

set mouse=a

set clipboard=unnamedplus

set ttyfast

set so=30
colorscheme afterglow
filetype plugin indent on

call plug#begin("~/.vim/plugged")
Plug 'scrooloose/nerdtree'
Plug 'preservim/nerdcommenter'
Plug 'ryanoasis/vim-devicons'
Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'
Plug 'neoclide/coc.nvim'
Plug 'phpactor/phpactor', {'for': 'php', 'tag': '*', 'do': 'composer install --no-dev -o'}
Plug 'flazz/vim-colorschemes'
Plug 'xolox/vim-colorscheme-switcher'
Plug 'xolox/vim-misc'
Plug 'Shougo/deoplete.nvim'
Plug 'phpactor/phpactor' ,  {'do': 'composer install', 'for': 'php'}
Plug 'kristijanhusak/deoplete-phpactor'
Plug 'tribela/vim-transparent'
Plug 'wakatime/vim-wakatime'
call plug#end()
call deoplete#custom#option('sources', {'php' : ['omni', 'phpactor', 'ultisnips', 'buffer']})
"autocmd StdinReadPre * let s:std_in=1
"autocmd VimEnter * NERDTree | wincmd p

" Включить/выключить NERDTree при нажатии \n
nnoremap <leader>n :NERDTreeToggle<CR>
" Юникодные иконки папок (Работает только с плагином vim-devicons)
let g:WebDevIconsUnicodeDecorateFolderNodes = 1
" Показывает количество строк в файлах
let g:NERDTreeFileLines = 1
" Игнорировать указанные папки
let g:NERDTreeIgnore = ['^node_modules$', '^__pycache__$']
" Закрыть vim, если единственная вкладка - это NERDTree
autocmd BufEnter * if tabpagenr('$') == 1 && winnr('$') == 1 && exists('b:NERDTree') && b:NERDTree.isTabTree() | quit | endif
let g:airline#extensions#tabline#enabled = 1
let g:airline_powerline_fonts = 1
let g:airline_statusline_ontop=0
let g:airline_theme='deus'
let g:airline#extensions#tabline#formatter = 'default'
" Автокомплиты через Tab
inoremap <expr> <Tab> coc#pum#visible() ? coc#pum#confirm() : "\<Tab>"
