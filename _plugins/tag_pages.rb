# frozen_string_literal: true

# Generate /tagged/<slug>/ pages for every tag used on posts.
# jekyll-bear-theme links blog tags to those URLs (via the `tagged` layout),
# but this site never checked in `_my_tags/` collection docs, so clicks 404'd.
# Building pages from `site.tags` keeps freeform post tags working without a
# manual whitelist.

module Jekyll
  class TagPage < PageWithoutAFile
    def initialize(site, tag)
      @site = site
      @base = site.source
      @dir  = File.join("tagged", tag)
      @name = "index.html"
      @path = File.join(@base, @dir, @name)

      process(@name)

      self.data = {
        "layout" => "tagged",
        "slug" => tag,
        "title" => tag,
        "permalink" => "/tagged/#{tag}/"
      }
    end
  end

  class TagPageGenerator < Generator
    safe true
    priority :low

    def generate(site)
      site.tags.each_key do |tag|
        next if tag.nil? || tag.to_s.strip.empty?
        next if tagged_page_exists?(site, tag)

        site.pages << TagPage.new(site, tag)
      end
    end

    private

    def tagged_page_exists?(site, tag)
      site.pages.any? { |p| p.data["layout"] == "tagged" && p.data["slug"] == tag } ||
        site.collections["my_tags"]&.docs&.any? do |doc|
          doc.data["slug"] == tag || doc.basename_without_ext == tag
        end
    end
  end
end
