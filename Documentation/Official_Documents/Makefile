TEX  = Report
ENGINE = xelatex
FLAGS  = -interaction=nonstopmode -halt-on-error

AUX = $(TEX).aux $(TEX).lof $(TEX).log $(TEX).lot \
      $(TEX).out $(TEX).toc $(TEX).fls $(TEX).fdb_latexmk \
      $(TEX).synctex.gz $(TEX).bbl $(TEX).blg $(TEX).run.xml \
      $(TEX).bcf missfont.log

.PHONY: all clean

all: $(TEX).pdf clean

$(TEX).pdf: $(TEX).tex
	$(ENGINE) $(FLAGS) $(TEX).tex
	$(ENGINE) $(FLAGS) $(TEX).tex
	$(ENGINE) $(FLAGS) $(TEX).tex

clean:
	rm -f $(AUX)
