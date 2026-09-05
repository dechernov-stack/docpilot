#set page(margin: 22mm)
#set text(font: "DejaVu Sans", size: 10pt, fill: rgb("17303a"))
#set heading(numbering: "1.1")

#let title = sys.inputs.at("title", default: "DocPilot · ConOps")
#let project = sys.inputs.at("project", default: "Проект не указан")
#let baseline = sys.inputs.at("baseline", default: "PREVIEW")
#let authors = sys.inputs.at("authors", default: "—")
#let body = sys.inputs.at("body", default: "Текст рендеринга не передан")

#align(center)[
  #v(28mm)
  #text(size: 22pt, weight: "bold")[#title]
  #v(8mm)
  #text()[Проект: #project]
  #v(4mm)
  #text(fill: rgb("176b87"))[Базирование: #baseline]
  #v(4mm)
  Авторы: #authors
]

#pagebreak()
= Подписи

#table(
  columns: (1fr, 1fr, 1fr),
  inset: 8pt,
  [*Роль*], [*ФИО / логин*], [*Подпись*],
  [Разработал], [#authors], [________________],
  [Выпустил], [#authors], [________________],
)

#pagebreak()
= Текст документа

#body
