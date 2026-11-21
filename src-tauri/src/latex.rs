use crate::resume::Resume;
use std::fmt::Write;

pub fn escape(text: &str) -> String {
    let mut result = String::new();
    for ch in text.chars() {
        result.push_str(match ch {
            '\\' => r"\textbackslash{}",
            '&' => r"\&",
            '%' => r"\%",
            '$' => r"\$",
            '#' => r"\#",
            '_' => r"\_",
            '{' => r"\{",
            '}' => r"\}",
            '~' => r"\textasciitilde{}",
            '^' => r"\textasciicircum{}",
            '\n' | '\r' => " ",
            '−' => r"\textminus{}",
            '→' => r"\textrightarrow{}",
            '←' => r"\textleftarrow{}",
            '✓' => "[x]",
            _ => {
                result.push(ch);
                continue;
            }
        });
    }
    result
}

pub fn inline(text: &str) -> String {
    let mut result = String::new();
    let mut remaining = text;
    while let Some(open) = remaining.find("**") {
        let tail = &remaining[open + 2..];
        let Some(close) = tail.find("**") else { break };
        result.push_str(&escape(&remaining[..open]));
        let bold = &tail[..close];
        if bold.is_empty() || bold.contains('\n') {
            result.push_str(&escape(&remaining[open..open + close + 4]));
        } else {
            let _ = write!(result, "\\textbf{{{}}}", escape(bold));
        }
        remaining = &tail[close + 2..];
    }
    result.push_str(&escape(remaining));
    result
}

fn link(url: &str, text: &str) -> String {
    let text = escape(text);
    let url = url::Url::parse(url)
        .ok()
        .filter(|url| matches!(url.scheme(), "https" | "http" | "mailto"));
    match url {
        Some(url) => {
            // hyperref needs literal URL characters after TeX has read the argument.
            let target = url
                .as_str()
                .replace('\\', "%5C")
                .replace('{', "%7B")
                .replace('}', "%7D")
                .replace('%', "\\%")
                .replace('#', "\\#")
                .replace('&', "\\&")
                .replace('_', "\\_");
            format!(r"\href{{{target}}}{{\underline{{{text}}}}}")
        }
        None => text,
    }
}

pub fn generate(resume: &Resume) -> Result<String, String> {
    let l = &resume.layout;
    l.validate()?;
    let mut out = format!(
        "\\documentclass[{},11pt]{{article}}\n{}\n",
        resume.page_size.tex(),
        include_str!("jake-preamble.tex")
    );
    let _ = writeln!(
        out,
        r"
\setlength{{\oddsidemargin}}{{-1in}}
\addtolength{{\oddsidemargin}}{{{x}in}}
\setlength{{\evensidemargin}}{{\oddsidemargin}}
\setlength{{\topmargin}}{{-1in}}
\addtolength{{\topmargin}}{{{y}in}}
\setlength{{\textwidth}}{{\paperwidth}}
\addtolength{{\textwidth}}{{-{double_x}in}}
\setlength{{\textheight}}{{\paperheight}}
\addtolength{{\textheight}}{{-{double_y}in}}
\titlespacing*{{\section}}{{0pt}}{{{section}bp}}{{3bp}}
\setlist[itemize]{{leftmargin=15bp, label=\textbullet, topsep=2bp, itemsep={bullet}bp, parsep=0pt, partopsep=0pt}}
\newlength{{\resumeItemGap}}
\setlength{{\resumeItemGap}}{{{item}bp}}
\begin{{document}}
\fontsize{{{font}bp}}{{{line}bp}}\selectfont",
        x = l.margin_x_in,
        y = l.margin_y_in,
        double_x = 2.0 * l.margin_x_in,
        double_y = 2.0 * l.margin_y_in,
        section = l.section_gap_pt,
        bullet = l.bullet_gap_pt,
        item = l.item_gap_pt,
        font = l.font_size_pt,
        line = l.font_size_pt * l.line_height
    );
    let p = &resume.profile;
    let address = format!("mailto:{}", p.email);
    let display = |url: &str, label: &str| {
        if label.is_empty() {
            url.to_owned()
        } else {
            label.to_owned()
        }
    };
    let contacts = [
        (p.phone.clone(), ""),
        (p.email.clone(), address.as_str()),
        (
            display(&p.linkedin_url, &p.linkedin_display),
            p.linkedin_url.as_str(),
        ),
        (
            display(&p.github_url, &p.github_display),
            p.github_url.as_str(),
        ),
        (
            display(&p.portfolio_url, &p.portfolio_display),
            p.portfolio_url.as_str(),
        ),
        (p.location.clone(), ""),
    ]
    .into_iter()
    .filter(|(label, _)| !label.is_empty())
    .map(|(label, url)| link(url, &label))
    .collect::<Vec<_>>();
    if !p.full_name.is_empty() || !contacts.is_empty() {
        out.push_str("\\begingroup\\centering\n");
        if !p.full_name.is_empty() {
            let _ = writeln!(
                out,
                "{{\\fontsize{{{:.3}bp}}{{{:.3}bp}}\\selectfont\\scshape\\bfseries {}}}\\par",
                l.font_size_pt * 2.39,
                l.font_size_pt * 2.39,
                escape(&p.full_name)
            );
        }
        if !contacts.is_empty() {
            let _ = writeln!(
                out,
                "\\vspace{{4bp}}{{\\small {}}}\\par",
                contacts.join(r" \textbar{} ")
            );
        }
        out.push_str("\\endgroup\n");
    }
    for section in &resume.sections {
        let _ = writeln!(out, "\\section{{{}}}", escape(&section.title));
        out.push_str("\\begin{list}{}{\\setlength{\\leftmargin}{.11in}\\setlength{\\rightmargin}{.11in}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\itemsep}{\\resumeItemGap}}\n");
        for entry in &section.items {
            out.push_str("\\item[]\n");
            let title = link(&entry.url, &entry.title);
            let subtitle = escape(&entry.subtitle);
            let dates = escape(&entry.date_range);
            let location = escape(&entry.location);
            match section.key.as_str() {
                "projects" | "publications" => {
                    let stack = if subtitle.is_empty() {
                        String::new()
                    } else {
                        format!(r" \textbar{{}} \emph{{{subtitle}}}")
                    };
                    let _ = writeln!(
                        out,
                        r"\resumeProjectHeading{{\textbf{{{title}}}{stack}}}{{{dates}}}"
                    );
                }
                "education" => {
                    let _ = writeln!(
                        out,
                        r"\resumeSubheading{{{title}}}{{{location}}}{{{subtitle}}}{{{dates}}}"
                    );
                }
                _ => {
                    let _ = writeln!(
                        out,
                        r"\resumeSubheading{{{title}}}{{{dates}}}{{{subtitle}}}{{{location}}}"
                    );
                }
            }
            if !entry.extra_line.is_empty() {
                let _ = writeln!(
                    out,
                    r"\vspace{{2bp}}\hspace*{{7bp}}{{\small {}}}\par",
                    inline(&entry.extra_line)
                );
            }
            if !entry.bullets.is_empty() {
                out.push_str("\\begin{itemize}\n");
                for bullet in &entry.bullets {
                    let _ = writeln!(out, "\\resumeItem{{{}}}", inline(&bullet.content));
                }
                out.push_str("\\end{itemize}\n");
            }
        }
        if !section.skills.is_empty() {
            out.push_str("\\item[]\n");
            for (index, category) in section.skills.iter().enumerate() {
                if index > 0 {
                    let _ = writeln!(out, "\\vspace{{{}bp}}", l.bullet_gap_pt);
                }
                let list = category
                    .skills
                    .iter()
                    .map(|s| escape(&s.name))
                    .collect::<Vec<_>>()
                    .join(", ");
                let _ = writeln!(
                    out,
                    "{{\\small \\textbf{{{}:}} {list}}}\\par",
                    escape(&category.name)
                );
            }
        }
        if section.items.is_empty() && section.skills.is_empty() {
            out.push_str("\\item[]\n");
        }
        out.push_str("\\end{list}\n");
    }
    out.push_str("\\end{document}\n");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_tex_and_preserves_bold_and_technical_terms() {
        assert_eq!(
            inline("C++ **C# 50% R&D snake_case $10K**"),
            r"C++ \textbf{C\# 50\% R\&D snake\_case \$10K}"
        );
        assert_eq!(
            escape(r"\{}~^"),
            r"\textbackslash{}\{\}\textasciitilde{}\textasciicircum{}"
        );
        assert_eq!(
            inline("Repeated **one** and **two** plus **unterminated"),
            r"Repeated \textbf{one} and \textbf{two} plus **unterminated"
        );
    }
}
